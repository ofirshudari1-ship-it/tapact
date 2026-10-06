# Privacy Policy - TapAct / מדיניות פרטיות

_Last updated / עודכן לאחרונה: 2026-10-06 (desktop agent v3.12.0 / Chrome extension v1.3.1)_

## English

TapAct has two components: a Windows desktop agent and a Chrome extension. Neither one has a TapAct server, an account, analytics or telemetry. Detection and clipboard history run on your own computer. A few features do contact other services; this page lists every one of them.

**What is read:** both components read the clipboard only to look for a phone number, tracking number, address, link, email or date: the desktop agent each time something is copied, the extension when you open its popup. Detection runs in memory on your computer; the copied text is not sent anywhere for analysis.

**What is stored, and where:**
- Desktop agent: message templates, settings, clipboard history, send history and lead history are stored in `%APPDATA%\TapAct` on your computer. If you use the optional AI cleanup, your Anthropic API key is stored there too, as plain text. Clipboard history can be turned off or cleared in Settings, and copies that Windows marks as sensitive (for example from a password manager) are not saved when the app can see that mark.
- Chrome extension: templates and settings are stored in `chrome.storage.sync` (synced by Chrome through your own Google account, not through TapAct); send history is stored in `chrome.storage.local` (this browser profile only).

**What leaves your computer:**

| What | When | Where it goes | What is sent |
|---|---|---|---|
| Update check (desktop agent) | At launch and about every 6 hours. There is no setting to turn the check off; "install on quit" can be turned off | GitHub (releases of the TapAct repository) | A normal web request, so GitHub sees your IP address. No clipboard content |
| Links you open | Only when you click an action (or if you turned on auto-run) | Your browser or an app on your computer, which then contacts the site: WhatsApp (`web.whatsapp.com` by default, `wa.me`, or the `whatsapp://` desktop app), Google Maps or Waze, a courier's tracking page or 17track, Google Calendar, Gmail | The phone number and message, address, tracking number or date you chose to act on, inside the link, exactly as if you typed the link yourself |
| Lead channels (desktop agent, off by default) | Only if you turn on a channel and press send | The webhook URL, Slack webhook URL or email address that you entered yourself | The lead's name, phone, role, source and the page title and URL |
| AI cleanup of a lead (desktop agent, off by default) | Only if you turn it on and enter your own API key | Anthropic's API (`api.anthropic.com`) | The same lead fields as above |
| Chrome extension | When you click "open in WhatsApp" | A new tab on `web.whatsapp.com` | The number and message in the link |

Nothing else is sent. The text you copy is never uploaded by detection or by clipboard history.

**Permissions justification (Chrome extension):**
- `storage` - to save templates, settings and history as described above.
- `clipboardRead` - to detect a phone number in what you just copied, only when you open the popup.

**Distribution:** the extension is currently distributed as an unpacked folder (`chrome-extension/`) loaded through Chrome's Developer Mode, not published on the Chrome Web Store. This document is kept accurate so it can be used if the extension is submitted there.

**Changes:** if an update changes what data is read, stored or sent, this file and the "What's new" notes will say so.

**Contact:** see `README.md` for how to reach the maintainer.

---

## עברית

ל-TapAct שני רכיבים: סוכן שולחן עבודה ל-Windows ותוסף Chrome. אין שרת של TapAct, אין חשבון, אין אנליטיקס ואין טלמטריה. הזיהוי והיסטוריית הלוח רצים על המחשב שלכם. כמה יכולות כן פונות לשירותים אחרים, והדף הזה מפרט את כולן.

**מה נקרא:** שני הרכיבים קוראים את הלוח רק כדי לחפש מספר טלפון, מספר מעקב, כתובת, קישור, אימייל או תאריך: סוכן שולחן העבודה בכל העתקה, והתוסף כשפותחים את החלונית שלו. הזיהוי רץ בזיכרון של המחשב, והטקסט שהועתק לא נשלח לשום מקום לניתוח.

**מה נשמר, ואיפה:**
- סוכן שולחן העבודה: תבניות הודעה, הגדרות, היסטוריית לוח, היסטוריית שליחות והיסטוריית לידים נשמרים ב-`%APPDATA%\TapAct` על המחשב שלכם. אם משתמשים בניקוי AI האופציונלי, גם מפתח ה-API של Anthropic נשמר שם, כטקסט רגיל. אפשר לכבות את היסטוריית הלוח או למחוק אותה בהגדרות, והעתקות ש-Windows מסמן כרגישות (למשל ממנהל סיסמאות) לא נשמרות כשהאפליקציה רואה את הסימון.
- תוסף Chrome: תבניות והגדרות נשמרות ב-`chrome.storage.sync` (Chrome מסנכרן אותן דרך חשבון Google שלכם, לא דרך TapAct); היסטוריית שליחות נשמרת ב-`chrome.storage.local` (פרופיל הדפדפן הזה בלבד).

**מה יוצא מהמחשב:**

| מה | מתי | לאן | מה נשלח |
|---|---|---|---|
| בדיקת עדכונים (סוכן שולחן העבודה) | בהפעלה וכל כ-6 שעות. אין הגדרה שמכבה את הבדיקה; אפשר לכבות את "התקנה ביציאה" | GitHub (הגרסאות של הריפו של TapAct) | בקשת אינטרנט רגילה, ולכן GitHub רואה את כתובת ה-IP שלכם. בלי תוכן מהלוח |
| קישורים שאתם פותחים | רק כשלוחצים על פעולה (או אם הדלקתם הרצה אוטומטית) | הדפדפן או אפליקציה במחשב, שפונים אחר כך לאתר: וואטסאפ (`web.whatsapp.com` כברירת מחדל, `wa.me`, או אפליקציית `whatsapp://`), Google Maps או Waze, דף המעקב של חברת המשלוחים או 17track, Google Calendar, Gmail | המספר וההודעה, הכתובת, מספר המעקב או התאריך שבחרתם לפעול עליהם, בתוך הקישור, בדיוק כאילו הקלדתם את הקישור בעצמכם |
| ערוצי לידים (סוכן שולחן העבודה, כבוי כברירת מחדל) | רק אם הדלקתם ערוץ ולחצתם שליחה | כתובת ה-webhook, כתובת ה-webhook של Slack או כתובת המייל שהזנתם בעצמכם | שם הליד, הטלפון, התפקיד, המקור וכותרת וכתובת הדף |
| ניקוי ליד ב-AI (סוכן שולחן העבודה, כבוי כברירת מחדל) | רק אם הדלקתם ואם הזנתם מפתח API משלכם | ה-API של Anthropic (`api.anthropic.com`) | אותם שדות ליד כמו למעלה |
| תוסף Chrome | כשלוחצים "פתח בוואטסאפ" | לשונית חדשה ב-`web.whatsapp.com` | המספר וההודעה בתוך הקישור |

שום דבר אחר לא נשלח. הטקסט שאתם מעתיקים לא מועלה לשום מקום על ידי הזיהוי או על ידי היסטוריית הלוח.

**הצדקת הרשאות (תוסף Chrome):**
- `storage` - לשמירת תבניות, הגדרות והיסטוריה כמתואר למעלה.
- `clipboardRead` - לזיהוי מספר טלפון במה שהועתק זה עתה, רק כשהחלונית נפתחת.

**הפצה:** התוסף מופץ כרגע כתיקייה לא ארוזה (`chrome-extension/`) שנטענת דרך Developer Mode של Chrome, ולא מפורסם ב-Chrome Web Store. המסמך הזה נשמר מדויק כדי שאפשר יהיה להשתמש בו אם התוסף יוגש לחנות.

**שינויים:** אם עדכון משנה אילו נתונים נקראים, נשמרים או נשלחים, זה ייכתב כאן ובהודעות "מה חדש".

**יצירת קשר:** ראו `README.md` לדרכי יצירת קשר עם המפתח.
