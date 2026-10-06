# TapAct

Copy something, get the right action in one click. A phone number opens WhatsApp with a message ready to send, a tracking number opens the courier's tracking page, an address opens navigation, a link opens in your browser - and everything you copy, even when nothing is detected, lands in a searchable local clipboard history (like Windows' own Win+V, only smarter).

Two independent components, install either or both:

| Component | Best for | Trigger | Detects |
|---|---|---|---|
| **Desktop agent** (`desktop-agent/`) | Copying from anywhere - Excel, a document, any app | Runs in the background automatically, or `Ctrl+Alt+P`/`Ctrl+Alt+V` any time | Phone, tracking number, address, link - plus a full local clipboard history |
| **Chrome extension** (`chrome-extension/`) | Working mostly in the browser | Click the icon, or `Alt+Shift+P` | Phone numbers only |

## Download & install

**[Download the latest version](https://github.com/ofirshudari1-ship-it/tapact/releases/latest)**

1. Go to the [releases page](https://github.com/ofirshudari1-ship-it/tapact/releases/latest) and download `TapAct-Setup-<version>.exe`.
2. Run the installer and follow the setup wizard (choose your language, installation folder, and shortcuts - English is the default if you just click Next).
3. Launch TapAct - it lives in the system tray.

For the Chrome extension: load `chrome-extension/` unpacked via `chrome://extensions` (Developer mode), or check the [Chrome Web Store listing](chrome-extension/) if published.

**Current version:** 3.11.0 (desktop agent) / 1.3.0 (Chrome extension) - versioned separately on purpose: the desktop agent ships bug fixes faster, while the extension has a slower release cycle since every change needs review against Chrome's store policy.

## Where to find things

| Want... | Find it in... |
|---|---|
| What it does, why, and how - in depth | [`SPEC.md`](SPEC.md) |
| A full usage guide | [`USER-GUIDE.md`](USER-GUIDE.md) |
| The marketing/landing page | [`site/index.html`](site/index.html) |
| What changed between versions | [`CHANGELOG.md`](CHANGELOG.md) |
| Desktop agent source | [`desktop-agent/`](desktop-agent/) |
| Chrome extension source | [`chrome-extension/`](chrome-extension/) |
| Privacy policy (what's collected, what isn't, why) | [`PRIVACY.md`](PRIVACY.md) |

**Single source of truth for everything:** the version lives in `desktop-agent/package.json`. History and decisions live in `CHANGELOG.md`. The code lives in `desktop-agent/src/`. Nothing is duplicated between files; documents link to each other instead of repeating content.

## Building from source

```bash
cd desktop-agent
npm install
npm start        # run from source
npm run dist      # build the Windows installer -> desktop-agent/dist/TapAct-Setup-<version>.exe
```

## Privacy, in short

No external server. All detection and clipboard history run and stay local on your machine. The only outbound action is opening a link in your default browser. Full detail: [`PRIVACY.md`](PRIVACY.md).
