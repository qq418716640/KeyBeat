// Content script: counts keydown events and sends batches to background.js

let keyCount = 0;
let flushTimer = null;

document.addEventListener("keydown", () => {
  keyCount++;
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 3000);
  }
});

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (keyCount === 0) return;
  const count = keyCount;
  try {
    chrome.runtime.sendMessage({ type: "KEY_COUNT", count });
    keyCount = 0; // Only reset after successful send
  } catch {
    // SW not available; keep keyCount for next flush attempt
  }
}

// Flush when the page is about to be hidden
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
