# KeyBeat

English | [中文](README.md)

> See each other's work rhythm through keystroke activity.

KeyBeat is a Chrome extension that lets couples sense each other's work status in real-time. It monitors keystroke frequency (not content) and displays an activity score with intuitive color coding -- so you know whether your partner is deep in focus or free to chat.

## How It Works

```
Keystroke Events → Activity Score (0-100) → Color-coded Badge → Real-time Sync
```

1. **Content Script** counts keystrokes across all tabs (content is never recorded)
2. **Service Worker** computes a weighted activity score from rolling 5/15/30-minute windows
3. **Firebase** syncs scores between paired users via SSE in real-time
4. **Badge & Popup** display both your own and your partner's status

### Activity Levels

Lower score = more typing activity (`score = 100 - activity`):

| Score | Status | Color | Meaning |
|-------|--------|-------|---------|
| 0-19 | Deep Focus | Gray | Typing intensively, fully concentrated |
| 20-39 | Busy | Green | Active at the keyboard |
| 40-59 | Moderate | Yellow | Regular activity |
| 60-79 | Light | Orange | Occasional typing |
| 80-100 | Free | Red | Idle, available to chat |

## Features

- **Privacy-first** -- only keystroke counts are tracked, never content or URLs
- **One-click pairing** -- generate a key, share it, done
- **Real-time sync** -- see your partner's status update live
- **Minimal permissions** -- only `alarms` and `storage`, no browsing history
- **Zero dependencies** -- pure JavaScript, no build step required
- **Manifest V3** -- built on the latest Chrome extension architecture

## Screenshot

```
┌─────────────────────────────┐
│          KeyBeat            │
│                             │
│    Me          Partner      │
│   ┌───┐        ┌───┐       │
│   │ 72│        │ 35│       │
│   └───┘        └───┘       │
│   Busy         Light        │
│                             │
│  [Generate Pair Key]        │
│        ── or ──             │
│  [Enter pair key] [Join]    │
└─────────────────────────────┘
```

## Quick Start

### 1. Set Up Firebase

You need a Firebase project for data synchronization.

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Enable **Anonymous Authentication** (Build → Authentication → Sign-in method → Anonymous)
3. Create a **Realtime Database** (Build → Realtime Database → Create Database)
4. Set the security rules:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && ($uid === auth.uid || root.child('users').child(auth.uid).child('partnerId').val() === $uid)",
        ".write": "auth != null && $uid === auth.uid"
      }
    },
    "pairKeys": {
      "$key": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "pairing": {
      "$uid": {
        ".read": "auth != null && $uid === auth.uid",
        ".write": "auth != null"
      }
    }
  }
}
```

5. Register a Web app (Project Settings → Your apps → Web) and copy the config values
6. Copy `lib/firebase-config.example.js` to `lib/firebase-config.js` and fill in your credentials:

```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  projectId: "YOUR_PROJECT_ID",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.YOUR_REGION.firebasedatabase.app",
};
```

### 2. Load the Extension

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this project folder
4. Pin KeyBeat to the toolbar for easy access

### 3. Pair with Your Partner

Both of you need the extension installed with Firebase configured.

**Person A:**
1. Click the KeyBeat icon → **Generate Pair Key**
2. Copy the key (format: `KB-XXXX-XXXX-XXXX`) and send it to your partner

**Person B:**
1. Click the KeyBeat icon → paste the key → **Join**
2. Pairing takes effect immediately

## Project Structure

```
keybeat/
├── manifest.json              # Extension manifest (Manifest V3)
├── background.js              # Service Worker -- scoring, sync, pairing logic
├── content.js                 # Content Script -- keystroke counting
├── lib/
│   ├── firebase-config.js     # Firebase config & credentials (not committed to Git)
│   └── firebase-config.example.js  # Config template
├── popup/
│   ├── popup.html             # Popup UI
│   ├── popup.js               # Popup interaction logic
│   └── popup.css              # Popup styles (dark theme)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

### Scoring Algorithm

Activity score is computed locally from rolling time windows:

```
score = (keystrokes_5min × 0.6) + (keystrokes_15min × 0.3) + (keystrokes_30min × 0.1)
```

The raw value is normalized to a 0-100 scale. Computation happens entirely on-device -- Firebase only receives the final score.

### Atomic Pairing

Pairing uses Firebase ETags (conditional writes) to prevent race conditions. When two people try to claim the same key simultaneously, only one succeeds -- the other gets a clean error.

### Architecture Choices

- **REST API + fetch** instead of Firebase SDK -- keeps the extension lightweight and Manifest V3 compatible
- **SSE via fetch ReadableStream** -- `EventSource` is unavailable in Service Workers, so SSE is parsed manually
- **Chrome Alarms** -- sync survives Service Worker suspension (MV3 can kill idle workers)
- **Anonymous Auth** -- no sign-up friction, identity tied to the browser profile

## Privacy

KeyBeat is designed with privacy as a core principle:

- **No keystroke content** -- only counts are recorded, never what you type
- **No browsing history** -- URLs and page titles are never accessed
- **Local computation** -- raw keystroke data never leaves your device
- **Anonymous authentication** -- no email, no password, no personal information
- **Minimal permissions** -- only `alarms` (for periodic sync) and `storage` (for local state)
- **Open source** -- verify everything yourself

## Contributing

Contributions are welcome! Some areas where help is appreciated:

- [ ] Customizable activity level thresholds
- [ ] Support for multiple partners / groups
- [ ] Firefox / Edge extension ports
- [ ] Internationalization (i18n)
- [ ] Chrome Web Store listing assets

Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
