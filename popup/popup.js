const $ = (id) => document.getElementById(id);

const LEVELS = [
  { max: 20, cls: "ring-focus", label: "Deep Focus" },
  { max: 40, cls: "ring-busy", label: "Busy" },
  { max: 60, cls: "ring-moderate", label: "Moderate" },
  { max: 80, cls: "ring-light", label: "Light" },
  { max: 101, cls: "ring-free", label: "Free" },
];

function scoreLevel(score) {
  for (const l of LEVELS) {
    if (score < l.max) return l;
  }
  return LEVELS[LEVELS.length - 1];
}

function applyRing(ringEl, score) {
  for (const l of LEVELS) ringEl.classList.remove(l.cls);
  if (typeof score === "number" && score >= 0) {
    ringEl.classList.add(scoreLevel(score).cls);
  }
}

// --- Apply status data to UI ---

function applyStatus(res) {
  // My score
  $("myScore").textContent = res.myScore ?? "--";
  applyRing($("myRing"), res.myScore);
  $("myDetail").textContent =
    res.recentKeyCount > 0
      ? `${res.recentKeyCount} keys (5 min)`
      : "";

  // Partner
  if (res.partnerId) {
    $("partnerScore").textContent = res.partnerScore ?? "--";
    applyRing($("partnerRing"), res.partnerScore);
    $("partnerLabel").textContent = "Partner";
    $("partnerDetail").textContent = scoreLevel(res.partnerScore ?? 0).label;
    showPaired();
  } else {
    $("partnerScore").textContent = "--";
    applyRing($("partnerRing"), -1);
    $("partnerLabel").textContent = "Partner";
    $("partnerDetail").textContent = "Not paired";
    showUnpaired();
  }
}

// --- Cache: save/restore last status to chrome.storage.local ---

const CACHE_KEY = "popup_last_status";

function cacheStatus(res) {
  chrome.storage.local.set({ [CACHE_KEY]: res });
}

async function restoreCachedStatus() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  if (data[CACHE_KEY]) {
    applyStatus(data[CACHE_KEY]);
  }
}

// --- Refresh from background (and cache result) ---

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    applyStatus(res);
    cacheStatus(res);
  });
}

function showPaired() {
  $("unpaired").classList.add("hidden");
  $("paired").classList.remove("hidden");
}

function showUnpaired() {
  $("paired").classList.add("hidden");
  $("unpaired").classList.remove("hidden");
}

// --- Generate pair key ---

$("btnGenerate").addEventListener("click", () => {
  $("btnGenerate").disabled = true;
  chrome.runtime.sendMessage({ type: "CREATE_PAIR_KEY" }, (res) => {
    $("btnGenerate").disabled = false;
    if (res && res.ok) {
      const keyEl = $("generatedKey");
      keyEl.textContent = res.key;
      const hint = document.createElement("span");
      hint.className = "copy-hint";
      hint.textContent = "Click to copy";
      keyEl.appendChild(hint);
      keyEl.classList.remove("hidden");
      $("pairError").classList.add("hidden");
    } else {
      showError(res?.error || "Failed to generate key");
    }
  });
});

// Copy key on click
$("generatedKey").addEventListener("click", () => {
  const keyEl = $("generatedKey");
  const hint = keyEl.querySelector(".copy-hint");
  const key = keyEl.textContent.replace(hint?.textContent || "", "").trim();
  navigator.clipboard.writeText(key).then(() => {
    if (hint) hint.textContent = "Copied!";
    setTimeout(() => {
      if (hint) hint.textContent = "Click to copy";
    }, 1500);
  }).catch(() => {
    // clipboard write failed, ignore
  });
});

// --- Join with key ---

$("btnJoin").addEventListener("click", () => {
  const key = $("inputKey").value.trim().toUpperCase();
  if (!key) return;
  $("btnJoin").disabled = true;
  chrome.runtime.sendMessage({ type: "JOIN_PAIR", key }, (res) => {
    $("btnJoin").disabled = false;
    if (res && res.ok) {
      $("pairError").classList.add("hidden");
      refreshStatus();
    } else {
      showError(res?.error || "Failed to join");
    }
  });
});

// --- Unpair ---

$("btnUnpair").addEventListener("click", () => {
  $("btnUnpair").classList.add("hidden");
  $("confirmUnpair").classList.remove("hidden");
});

$("btnConfirmNo").addEventListener("click", () => {
  $("confirmUnpair").classList.add("hidden");
  $("btnUnpair").classList.remove("hidden");
});

$("btnConfirmYes").addEventListener("click", () => {
  $("confirmUnpair").classList.add("hidden");
  $("confirmReally").classList.remove("hidden");
});

$("btnReallyNo").addEventListener("click", () => {
  $("confirmReally").classList.add("hidden");
  $("btnUnpair").classList.remove("hidden");
});

$("btnReallyYes").addEventListener("click", () => {
  $("btnReallyYes").disabled = true;
  chrome.runtime.sendMessage({ type: "UNPAIR" }, () => {
    $("btnReallyYes").disabled = false;
    $("confirmReally").classList.add("hidden");
    $("btnUnpair").classList.remove("hidden");
    refreshStatus();
  });
});

function showError(msg) {
  $("pairError").textContent = msg;
  $("pairError").classList.remove("hidden");
}

// --- Startup: restore cache first, then refresh from background ---

restoreCachedStatus();
refreshStatus();
setInterval(refreshStatus, 5000);
