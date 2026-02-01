import {
  getValidToken,
  getUid,
  dbGet,
  dbUpdate,
  dbGetWithEtag,
  dbSetIfMatch,
  dbListen,
  exportIdentity,
  restoreIdentity,
} from "./lib/firebase-config.js";

// --- State ---

// Rolling window buckets: each entry is { ts, count }
let recentKeys = [];
let myScore = 0;
let partnerScore = 0;
let partnerId = null;
let partnerUnsubscribe = null;
let pairingUnsubscribe = null;
let initialized = false;
let initFailed = false;

const WINDOW_5M = 5 * 60 * 1000;
const WINDOW_15M = 15 * 60 * 1000;
const WINDOW_30M = 30 * 60 * 1000;
const SYNC_INTERVAL_NAME = "keybeat-sync";
const SYNC_PERIOD_MINUTES = 0.5; // 30 seconds (Chrome minimum)
const PAIR_KEY_REGEX = /^KB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// --- Init ---

// restoreKeys must complete before any score computation
let keysReady = false;
let keysReadyPromise = restoreKeys().then(() => {
  keysReady = true;
});

async function init() {
  if (initialized) return;

  // Wait for keys to be restored
  if (!keysReady) await keysReadyPromise;

  chrome.alarms.create(SYNC_INTERVAL_NAME, {
    delayInMinutes: SYNC_PERIOD_MINUTES,
    periodInMinutes: SYNC_PERIOD_MINUTES,
  });

  try {
    await getValidToken();
    const uid = getUid();
    if (!uid) throw new Error("No UID after auth");

    // Load partner info
    const userData = await dbGet(`users/${uid}`);
    if (userData && userData.partnerId) {
      partnerId = userData.partnerId;
      watchPartner(partnerId);
    }

    // Watch for incoming pair requests and unpair notifications
    watchPairing(uid);

    initialized = true;
    initFailed = false;
  } catch (err) {
    console.error("[KeyBeat] init failed:", err);
    initFailed = true;
  }
}

async function ensureInit() {
  if (!keysReady) await keysReadyPromise;
  if (!initialized) await init();
}

// --- Key counting & persistence ---

async function persistKeys() {
  await chrome.storage.local.set({ recentKeys });
}

async function restoreKeys() {
  const data = await chrome.storage.local.get("recentKeys");
  if (data.recentKeys && Array.isArray(data.recentKeys)) {
    recentKeys = data.recentKeys;
    pruneOldKeys();
  }
}

// --- Periodic sync (alarm-based, survives SW sleep) ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_INTERVAL_NAME) return;

  try { await ensureInit(); } catch {}

  // Always compute and update locally, even if Firebase is unreachable
  pruneOldKeys();
  persistKeys();
  computeScore();
  updateBadge();

  // Sync to Firebase separately (don't block local updates)
  try { await syncToFirebase(); } catch {}
});

function pruneOldKeys() {
  const cutoff = Date.now() - WINDOW_30M;
  recentKeys = recentKeys.filter((k) => k.ts >= cutoff);
}

function windowCount(ms) {
  const cutoff = Date.now() - ms;
  let total = 0;
  for (const k of recentKeys) {
    if (k.ts >= cutoff) total += k.count;
  }
  return total;
}

function computeScore() {
  const c5 = windowCount(WINDOW_5M);
  const c15 = windowCount(WINDOW_15M);
  const c30 = windowCount(WINDOW_30M);

  // Exclusive window counts (not cumulative)
  const only5 = c5;
  const only15 = c15 - c5;
  const only30 = c30 - c15;

  const raw = only5 * 0.6 + only15 * 0.3 + only30 * 0.1;

  // Tuned so normal work intensity lands around 40-70
  const maxRaw = 200;
  myScore = 100 - Math.min(100, Math.round((raw / maxRaw) * 100));
}

async function syncToFirebase() {
  const uid = getUid();
  if (!uid) return;
  try {
    const remote = await dbGet(`users/${uid}`);
    if (
      remote &&
      typeof remote.score === "number" &&
      remote.score < myScore &&
      typeof remote.updatedAt === "number" &&
      Date.now() - remote.updatedAt < 2 * 60 * 1000
    ) {
      return; // another device is more active, skip write
    }
    await dbUpdate(`users/${uid}`, {
      score: myScore,
      keycount5: windowCount(WINDOW_5M),
      keycount15: windowCount(WINDOW_15M),
      keycount30: windowCount(WINDOW_30M),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[KeyBeat] sync failed:", err);
  }
}

// --- Partner watching ---

function watchPartner(pid) {
  if (partnerUnsubscribe) partnerUnsubscribe();
  if (!pid) {
    partnerScore = 0;
    updateBadge();
    return;
  }
  partnerUnsubscribe = dbListen(`users/${pid}`, (data, err) => {
    if (err) {
      console.error("[KeyBeat] partner listen error:", err);
      return;
    }
    if (data && typeof data.score === "number") {
      partnerScore = data.score;
    } else if (data === null) {
      partnerScore = 0;
    }
    updateBadge();
  });
}

// --- Pairing node watcher ---

function watchPairing(uid) {
  if (pairingUnsubscribe) pairingUnsubscribe();
  pairingUnsubscribe = dbListen(`pairing/${uid}`, (data, err) => {
    if (err || !data) return;
    if (data.unpaired && partnerId) {
      // Partner unpaired us
      partnerId = null;
      if (partnerUnsubscribe) partnerUnsubscribe();
      partnerUnsubscribe = null;
      partnerScore = 0;
      dbUpdate(`users/${uid}`, { partnerId: null });
      // Clean up stale pairing data
      dbUpdate(`pairing/${uid}`, { unpaired: null, partnerId: null });
      updateBadge();
    } else if (data.partnerId && !partnerId) {
      // Someone paired with us
      partnerId = data.partnerId;
      dbUpdate(`users/${uid}`, { partnerId: data.partnerId });
      watchPartner(partnerId);
    }
  });
}

// --- Badge / icon color ---

const SCORE_COLORS = [
  { max: 20, color: "#9E9E9E", label: "deep focus" },
  { max: 40, color: "#4CAF50", label: "busy" },
  { max: 60, color: "#FFEB3B", label: "moderate" },
  { max: 80, color: "#FF9800", label: "light" },
  { max: 101, color: "#F44336", label: "free" },
];

function scoreToColor(score) {
  for (const s of SCORE_COLORS) {
    if (score < s.max) return s;
  }
  return SCORE_COLORS[SCORE_COLORS.length - 1];
}

function updateBadge() {
  const display = partnerId ? partnerScore : myScore;
  const { color } = scoreToColor(display);
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text: display > 0 ? String(display) : "" });
}

// --- Pairing ---

function generatePairKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  };
  return `KB-${seg()}-${seg()}-${seg()}`;
}

async function createPairKey() {
  await ensureInit();
  if (partnerId) throw new Error("Already paired");
  const uid = getUid();
  const key = generatePairKey();
  await dbUpdate(`pairKeys/${key}`, {
    creatorId: uid,
    createdAt: Date.now(),
    used: false,
  });
  return key;
}

async function joinWithPairKey(key) {
  await ensureInit();
  if (partnerId) throw new Error("Already paired");

  // Validate key format
  if (!PAIR_KEY_REGEX.test(key)) throw new Error("Invalid key format");

  const uid = getUid();

  // Atomic claim using ETag (C5 fix)
  const { data: pairData, etag } = await dbGetWithEtag(`pairKeys/${key}`);
  if (!pairData) throw new Error("Invalid pair key");
  if (pairData.used) throw new Error("Pair key already used");
  if (pairData.creatorId === uid) throw new Error("Cannot pair with yourself");

  const creatorId = pairData.creatorId;

  // Atomically mark key as used (fails if someone else claimed it first)
  const result = await dbSetIfMatch(`pairKeys/${key}`, {
    ...pairData,
    used: true,
    joinedBy: uid,
  }, etag);

  if (!result.ok) throw new Error("Pair key was just claimed by someone else");

  // B writes own partnerId
  await dbUpdate(`users/${uid}`, { partnerId: creatorId });

  // B writes A's partnerId via the pairing node
  await dbUpdate(`pairing/${creatorId}`, { partnerId: uid, pairKey: key, unpaired: null });

  partnerId = creatorId;
  watchPartner(partnerId);
  return creatorId;
}

async function unpair() {
  await ensureInit();
  const uid = getUid();
  if (!partnerId) return;
  const oldPartner = partnerId;
  partnerId = null;
  if (partnerUnsubscribe) partnerUnsubscribe();
  partnerUnsubscribe = null;
  partnerScore = 0;
  updateBadge();

  await dbUpdate(`users/${uid}`, { partnerId: null });
  // Notify partner via pairing node
  await dbUpdate(`pairing/${oldPartner}`, { partnerId: null, unpaired: true });
  // Clean up own pairing node
  await dbUpdate(`pairing/${uid}`, { partnerId: null, unpaired: null });
}

// --- Single message handler for all message types (C2 fix) ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "KEY_COUNT" && typeof msg.count === "number") {

    if (!keysReady) {
      keysReadyPromise.then(() => {
        recentKeys.push({ ts: Date.now(), count: msg.count });
        persistKeys();
        computeScore();
        updateBadge();

      });
    } else {
      recentKeys.push({ ts: Date.now(), count: msg.count });
      persistKeys();
      computeScore();
      updateBadge();

    }
    return;
  }

  if (msg.type === "GET_STATUS") {

    (async () => {
      try {
        if (!keysReady) await keysReadyPromise;


        pruneOldKeys();
        computeScore();


        // Try Firebase init but don't block forever
        if (!initialized) {
          try {
            await Promise.race([
              init(),
              new Promise((_, reject) => setTimeout(() => reject(), 3000)),
            ]);
          } catch {}
        }

        // Fetch partner score if paired
        if (partnerId) {
          if (!partnerUnsubscribe) watchPartner(partnerId);
          try {
            const pData = await Promise.race([
              dbGet(`users/${partnerId}`),
              new Promise((_, reject) => setTimeout(() => reject(), 2000)),
            ]);
            if (pData && typeof pData.score === "number") {
              partnerScore = pData.score;
            }
          } catch {}
        }
      } catch (err) {
        console.error("[KeyBeat] GET_STATUS error:", err);
      } finally {
        const resp = {
          uid: getUid(),
          myScore,
          partnerScore,
          partnerId,
          recentKeyCount: windowCount(WINDOW_5M),
        };

        sendResponse(resp);
      }
    })();
    return true;
  }

  if (msg.type === "CREATE_PAIR_KEY") {
    createPairKey().then(
      (key) => sendResponse({ ok: true, key }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === "JOIN_PAIR") {
    joinWithPairKey(msg.key).then(
      (pid) => sendResponse({ ok: true, partnerId: pid }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === "UNPAIR") {
    unpair().then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === "EXPORT_IDENTITY") {
    exportIdentity().then(
      (code) => sendResponse({ ok: true, code }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }

  if (msg.type === "IMPORT_IDENTITY") {
    (async () => {
      try {
        // Stop existing listeners
        if (partnerUnsubscribe) { partnerUnsubscribe(); partnerUnsubscribe = null; }
        if (pairingUnsubscribe) { pairingUnsubscribe(); pairingUnsubscribe = null; }

        const result = await restoreIdentity(msg.code);

        // Reset state
        partnerId = null;
        partnerScore = 0;
        initialized = false;
        initFailed = false;

        // Re-initialize with restored identity
        await init();

        sendResponse({ ok: true, uid: result.uid });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

// --- Startup ---


chrome.runtime.onInstalled.addListener(() => {
  init();
});

chrome.runtime.onStartup.addListener(() => {
  init();
});

init();
