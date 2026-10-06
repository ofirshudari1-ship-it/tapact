# TapAct

**Copy something on Windows, get the right next step automatically — built for call centers.**

## What it does

TapAct is a small Windows background app (it lives in the system tray, no visible window) that watches your clipboard everywhere on the computer, not just inside a browser tab. It's built for the fast copy-paste workflow of a call center: copy a customer's phone number and a WhatsApp composer pops up ready to send; copy a shipment tracking number and it offers to open the carrier's tracking page; copy an address and it offers Google Maps or Waze; copy a plain link and it offers to open it. Everything else you copy is still quietly logged to a searchable local clipboard history (like Windows' own Win+V), so nothing is ever lost even when no action fires. Detection and history run locally on your computer. What goes out is listed in the Privacy section below.

## Download & install

Get the latest installer from the GitHub Releases page:

**[Download the latest version](https://github.com/ofirshudari1-ship-it/tapact/releases/latest)**

1. Download `TapAct-Setup-<version>.exe` from the release's Assets.
2. Run the installer. It installs for all users (Program Files) and asks for administrator permission once. TapAct itself runs as a normal user (no prompt when it starts), and updates ask for administrator permission once when they install.
3. Follow the setup wizard: choose English or Hebrew, then finish.
4. TapAct starts after the installer finishes and adds an icon to your system tray (it may be hidden under the "^" arrow the first time). "Start with Windows" is off until you turn it on in Settings; it works because TapAct does not need administrator rights to start.
5. Copy a phone number, address, tracking number, or link to try it out.

**System requirements:** Windows 10/11.

## Key features

- **Phone number → WhatsApp**: a ready-made message composer with a name field and template picker, for Israeli numbers by default with an international fallback for numbers copied with an explicit `+countrycode` prefix.
- **Tracking number → carrier tracking page** (Israel Post, UPS, DHL, FedEx, with a 17track fallback).
- **Address → Google Maps or Waze** navigation, Hebrew or English.
- **Plain link → opens in your default browser.**
- **Custom action rules**: define your own regex pattern → URL template rules for formats specific to your business (e.g. an internal order number that opens your CRM), on top of the five built-in detectors.
- **Clipboard history** (`Ctrl+Alt+V`): a searchable, filterable log of everything you copy, not just what triggered a popup — re-copy or re-run any past item's action with one click. Anything your system already flags as a sensitive copy (like a password) is never logged.
- **Message templates** per lead type, and a send-history log (last 25 WhatsApp sends) exportable to CSV.
- **Tray quick-repeat menu** for instantly re-firing the last few detected actions.
- Full bilingual **English/Hebrew UI**, an optional "Start with Windows" setting (off by default), and configurable popup timing.

## Automatic updates

TapAct checks GitHub for new versions at launch and about every 6 hours while it runs, downloads them in the background and asks before restarting (via electron-updater). If you choose "Later", the update installs when you quit TapAct, and TapAct does not start again by itself afterwards. You can always find the latest release yourself on the [Releases page](https://github.com/ofirshudari1-ship-it/tapact/releases).

## Privacy

- No TapAct server, no account, no analytics. Clipboard text is inspected in memory on your computer; detection sends nothing anywhere.
- Clipboard history, if enabled, is stored in `%APPDATA%\TapAct` on your machine. Turn it off or clear it anytime from Settings.
- What does leave the computer: the update check to GitHub (launch, then about every 6 hours); the link you click (WhatsApp Web by default, `wa.me` or the WhatsApp app, Maps, Waze, a tracking page, Calendar, Gmail) opened in your browser or app, carrying the number, address or tracking number you acted on; and, only if you turn them on, the lead channels (your webhook, Slack, email) and the AI cleanup (Anthropic's API, your own key, stored as plain text in the settings file).
- Links from imported history or custom rules are opened only if they are http, https, mailto, tel or whatsapp links.
- You can pause monitoring anytime from the tray menu.

Full detail: [`../PRIVACY.md`](../PRIVACY.md).

## Upgrading from ActionClip

TapAct is the new name of ActionClip 2.x, which used a different installer identity, so both can end up installed side by side. Both watch the clipboard (two popups per copy, and one loses the `Win+V` shortcut). On a fresh install the TapAct installer detects ActionClip and asks whether to uninstall it (default: No; never asked in silent installs or updates). ActionClip's own data is not deleted or imported.
