# TapAct - Chrome Extension

Copy any phone number (from a CRM, spreadsheet, email, a Facebook/LinkedIn
profile - anywhere), click the TapAct icon (or press **Alt+Shift+P**), and
it opens a WhatsApp chat with a ready-made message - no retyping the number,
no opening WhatsApp Web and starting a blank chat.

## Install

Chrome doesn't allow silently installing an unpacked extension no matter
what - Developer mode + Load unpacked is unavoidable, so there's no
installer here. Two ways to get the files:

- Use this `chrome-extension` folder directly, or
- Download `TapAct-v1.2.1.zip` (same folder) and unzip it anywhere.

Then:

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the folder (this one, or the
   unzipped copy).
4. Pin the TapAct icon in the toolbar.

That's it - about 30 seconds, once per machine. Re-loading after an update
is the same steps (or just click the refresh icon on TapAct's card in
`chrome://extensions` if the folder path hasn't changed).

## Using it

1. Copy a phone number (or any text that contains one) - `Ctrl+C`.
2. Click the TapAct icon, or press `Alt+Shift+P`.
3. The popup shows the detected number, a name field (optional), and a
   message template. Pick a different template from the dropdown if needed,
   tweak the text, then click **פתח בוואטסאפ**.
4. A new tab opens WhatsApp Web (`web.whatsapp.com/send`) on that number with the
   message pre-filled - just hit send in WhatsApp.

If no number was detected in the last copy (or clipboard access was
blocked), a manual field lets you paste/type one instead.

## Managing templates, settings and history

Click the ⚙ icon in the popup (or go to `chrome://extensions` → TapAct →
Details → Extension options) for three tabs:

- **תבניות הודעה** - add, edit, delete templates, and pick the default one.
  The token `{שם}` is replaced with whatever name is typed in the popup (or
  removed if left blank).
- **הגדרות** - the duplicate-send warning window (minutes). Sending to a
  number messaged again within that window shows a banner in the popup
  ("already messaged N minutes ago") instead of silently blocking it.
- **היסטוריה** - the last 25 sends (number, name, template, when), with
  buttons to export to CSV (Excel-friendly, UTF-8 with BOM) or clear it.

## Privacy

Everything happens locally in the browser: the extension reads your
clipboard only when you open its popup, never sends it anywhere, and the
only outbound action is opening a `wa.me` link in a new tab (which is just
opening WhatsApp Web with the browser you already have signed in).
Templates and settings are stored in `chrome.storage.sync` (your own Google
account); send history is stored in `chrome.storage.local` (this browser
profile only, not synced) - either way, not on any TapAct server, because
there isn't one. Full policy: [`../PRIVACY.md`](../PRIVACY.md).
