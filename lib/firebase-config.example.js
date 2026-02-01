// Firebase REST API wrapper for Manifest V3 Service Worker
// Copy this file to firebase-config.js and fill in your Firebase credentials.
// Uses fetch-based SSE instead of EventSource (unavailable in SW)

const FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.YOUR_REGION.firebasedatabase.app",
};

let _idToken = null;
let _uid = null;
let _refreshToken = null;
let _tokenExpiresAt = 0;

// --- Auth ---

async function signInAnonymously() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  _idToken = data.idToken;
  _refreshToken = data.refreshToken;
  _uid = data.localId;
  _tokenExpiresAt = Date.now() + parseInt(data.expiresIn, 10) * 1000;
  return { uid: _uid, idToken: _idToken };
}

async function refreshIdToken() {
  if (!_refreshToken) throw new Error("No refresh token");
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: _refreshToken,
      }),
    }
  );
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  _idToken = data.id_token;
  _refreshToken = data.refresh_token;
  _uid = data.user_id;
  _tokenExpiresAt = Date.now() + parseInt(data.expires_in, 10) * 1000;
  return _idToken;
}

async function getValidToken() {
  if (!_idToken) {
    const stored = await chrome.storage.local.get([
      "fb_idToken",
      "fb_refreshToken",
      "fb_uid",
      "fb_tokenExpiresAt",
    ]);
    if (stored.fb_refreshToken) {
      _refreshToken = stored.fb_refreshToken;
      _uid = stored.fb_uid;
      _idToken = stored.fb_idToken;
      _tokenExpiresAt = stored.fb_tokenExpiresAt || 0;
    }
  }

  if (_idToken && Date.now() < _tokenExpiresAt - 60000) {
    return _idToken;
  }

  if (_refreshToken) {
    try {
      await refreshIdToken();
      await _persistAuth();
      return _idToken;
    } catch (err) {
      // Only fall through to anonymous sign-up if the token is permanently
      // invalid (400 = invalid grant / token revoked).  Transient errors
      // (network, 5xx) must NOT silently replace the user's identity.
      const status = parseInt(err?.message?.match(/(\d{3})/)?.[1], 10);
      if (status !== 400) throw err;
      // 400 → token is permanently invalid, clear it and create fresh identity
      _refreshToken = null;
    }
  }

  await signInAnonymously();
  await _persistAuth();
  return _idToken;
}

async function _persistAuth() {
  await chrome.storage.local.set({
    fb_idToken: _idToken,
    fb_refreshToken: _refreshToken,
    fb_uid: _uid,
    fb_tokenExpiresAt: _tokenExpiresAt,
  });
}

function getUid() {
  return _uid;
}

// --- Realtime Database REST ---

async function dbGet(path) {
  const token = await getValidToken();
  const res = await fetch(
    `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${token}`
  );
  if (!res.ok) throw new Error(`DB GET ${path} failed: ${res.status}`);
  return res.json();
}

async function dbUpdate(path, value) {
  const token = await getValidToken();
  const res = await fetch(
    `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${token}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }
  );
  if (!res.ok) throw new Error(`DB PATCH ${path} failed: ${res.status}`);
  return res.json();
}

// Conditional PUT using ETag for atomic writes
async function dbSetIfMatch(path, value, etag) {
  const token = await getValidToken();
  const res = await fetch(
    `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${token}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "if-match": etag,
      },
      body: JSON.stringify(value),
    }
  );
  if (res.status === 412) return { ok: false, reason: "etag_mismatch" };
  if (!res.ok) throw new Error(`DB PUT ${path} failed: ${res.status}`);
  return { ok: true, data: await res.json() };
}

// GET with ETag returned
async function dbGetWithEtag(path) {
  const token = await getValidToken();
  const res = await fetch(
    `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${token}`,
    { headers: { "X-Firebase-ETag": "true" } }
  );
  if (!res.ok) throw new Error(`DB GET ${path} failed: ${res.status}`);
  const etag = res.headers.get("ETag");
  const data = await res.json();
  return { data, etag };
}

// --- Identity backup / restore ---

async function exportIdentity() {
  const token = await getValidToken();
  const uid = getUid();
  if (!uid || !_refreshToken) throw new Error("Not authenticated");
  const payload = JSON.stringify({
    uid,
    refreshToken: _refreshToken,
    exportedAt: Date.now(),
  });
  return "KBRC-" + btoa(payload);
}

async function restoreIdentity(code) {
  if (!code || !code.startsWith("KBRC-")) throw new Error("Invalid recovery code format");
  let payload;
  try {
    payload = JSON.parse(atob(code.slice(5)));
  } catch {
    throw new Error("Invalid recovery code");
  }
  if (!payload.uid || !payload.refreshToken) throw new Error("Incomplete recovery code");

  // Verify the refresh token is still valid
  _refreshToken = payload.refreshToken;
  _uid = payload.uid;
  _idToken = null;
  _tokenExpiresAt = 0;

  try {
    await refreshIdToken();
  } catch {
    throw new Error("Recovery code expired or invalid");
  }

  await _persistAuth();
  return { uid: _uid };
}

// --- Fetch-based SSE listener (works in MV3 Service Workers) ---

function dbListen(path, callback) {
  let cancelled = false;
  let abortController = null;
  let retryDelay = 1000;
  const MAX_RETRY_DELAY = 60000;
  // Accumulated state from put/patch events
  let currentData = undefined;

  async function start() {
    if (cancelled) return;
    retryDelay = 1000;

    try {
      const token = await getValidToken();
      const url = `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=${token}`;

      abortController = new AbortController();
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || cancelled) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:") && currentEvent) {
            const dataStr = line.slice(5).trim();
            try {
              const payload = JSON.parse(dataStr);
              if (currentEvent === "put") {
                if (payload.path === "/") {
                  currentData = payload.data;
                } else {
                  // Sub-path put: merge into currentData
                  if (currentData === undefined) currentData = {};
                  setNestedValue(currentData, payload.path, payload.data);
                }
                callback(currentData, null);
              } else if (currentEvent === "patch") {
                // Patch: merge fields into currentData at the given path
                if (currentData === undefined) currentData = {};
                if (payload.path === "/" && typeof payload.data === "object" && payload.data !== null) {
                  Object.assign(currentData, payload.data);
                } else if (typeof payload.data === "object" && payload.data !== null) {
                  let target = getNestedValue(currentData, payload.path);
                  if (typeof target === "object" && target !== null) {
                    Object.assign(target, payload.data);
                  } else {
                    setNestedValue(currentData, payload.path, payload.data);
                  }
                } else {
                  setNestedValue(currentData, payload.path, payload.data);
                }
                callback(currentData, null);
              }
            } catch (err) {
              callback(null, err);
            }
            currentEvent = "";
          } else if (line.trim() === "") {
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      if (cancelled) return;
      console.warn(`[KeyBeat] SSE error on ${path}:`, err.message);
    }

    // Reconnect with exponential backoff
    if (!cancelled) {
      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      setTimeout(() => {
        if (!cancelled) start();
      }, delay);
    }
  }

  start();

  return () => {
    cancelled = true;
    if (abortController) abortController.abort();
  };
}

// Helpers for nested path operations
function setNestedValue(obj, path, value) {
  const parts = path.split("/").filter(Boolean);
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  if (parts.length > 0) {
    current[parts[parts.length - 1]] = value;
  }
}

function getNestedValue(obj, path) {
  const parts = path.split("/").filter(Boolean);
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[p];
  }
  return current;
}

export {
  FIREBASE_CONFIG,
  getValidToken,
  getUid,
  dbGet,
  dbUpdate,
  dbGetWithEtag,
  dbSetIfMatch,
  dbListen,
  exportIdentity,
  restoreIdentity,
};
