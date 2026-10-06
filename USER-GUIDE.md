# TapAct - User Guide / מדריך משתמש

Current version: 3.12.1. Download: https://github.com/ofirshudari1-ship-it/tapact/releases/latest

## English

### What is TapAct?

A Windows background agent that watches what you copy and offers the right next action. Copy a phone number and a small window opens with WhatsApp ready. Copy a tracking number and it opens the courier's page. Copy an address and it opens navigation. Everything you copy is also kept in a searchable local clipboard history. Detection and history stay on your computer. What does leave it is listed under "Privacy" below.

### Install

1. Download `TapAct-Setup-<version>.exe` from the [latest release](https://github.com/ofirshudari1-ship-it/tapact/releases/latest).
2. Run it. The installer asks for administrator permission once and lets you choose the language (English or Hebrew). TapAct itself then runs as a normal user, with no permission prompt when it starts, and "Start with Windows" (Settings > General) really starts it when you sign in. An update asks for administrator permission once when it installs.
3. TapAct starts in the system tray. On the first run a short welcome guide opens in the language of your Windows.
4. TapAct checks for updates at launch and about every 6 hours, downloads them quietly and asks before restarting. If you pick "Later" the update installs when you quit TapAct, and you start TapAct again yourself. Settings > About > Updates shows the status and has "Check for updates now".
5. If the older ActionClip is installed, the installer offers to uninstall it (default: No). Running both shows two popups for every copy.

### Daily use

| You do | TapAct does |
|---|---|
| Copy a phone number | A small window opens next to the cursor with WhatsApp and a ready message. It closes by itself after 7 seconds, and stays open while the mouse is on it or you are typing in it. After you click WhatsApp it closes by itself when WhatsApp is the only channel turned on |
| Copy a tracking number, address or link | A small action window opens the same way |
| Copy a long text that happens to contain a number | No window (it is only saved to history) |
| `Ctrl+Alt+P` | Opens the window for whatever is on the clipboard, any time |
| `Win+V` or `Ctrl+Alt+V` | Opens the clipboard history (`Win+V` only works if Windows' own clipboard history is turned off) |

### When the window does not open (on purpose)

- The copy is long text, not mainly a phone number (up to about 40 characters for a phone), or an ordinary number such as an ID or invoice number.
- TapAct itself put it on the clipboard (for example pasting from history), or you copied inside a TapAct window.
- You copied the same thing less than 10 seconds ago (the wait is set in Settings > General settings; 0 means no wait), or you copied the very same text twice in a row, which TapAct does not see as a new copy: copy something else in between, or press `Ctrl+Alt+P`.
- Quiet hours are on, monitoring is paused, or you snoozed the popup.
- Several windows opened within 20 seconds (for example copying a column of numbers): popups pause for a minute, everything is still saved to history.

### Where WhatsApp opens

By default the chat opens in WhatsApp Web in your browser. Settings > General settings > "Where WhatsApp opens" lets you pick the WhatsApp desktop app instead (if it is not installed, WhatsApp Web opens), or the wa.me link.

### Snooze and close

Next to the X on every popup there is a snooze button: 15 minutes, 1 hour, until tomorrow 08:00, or "stop showing this type". While snoozed, history keeps recording and the manual shortcut still works. The tray menu shows the snooze and lets you resume. A type you turned off can be turned on again in Settings > Detection types.

### Settings

Right-click the tray icon > Settings. Main tabs: Message templates (use `{name}` or `{שם}` for the customer's name), Detection types, Custom rules, General settings (one Save button), Keyboard shortcuts, Auto tags, Lead settings, Clipboard history, Send history, About.

### Privacy

No TapAct server, no account, no analytics. Detection and clipboard history run on your computer. What leaves it: the update check (GitHub); the link you click, which carries the number, address or tracking number you acted on (WhatsApp Web, `wa.me` or the WhatsApp app, Maps, Waze, a tracking page); and, only if you turn them on in "Lead settings", your own webhook, Slack or email, and the optional AI cleanup (Anthropic, with your own API key, stored as plain text in the settings file). Full policy: PRIVACY.md.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing pops up | Check the tray menu: monitoring may be paused or snoozed. Then check Settings > Detection types and quiet hours |
| It worked and then stopped | Exit from the tray (Exit) and open TapAct again, then update to the latest version |
| `Win+V` does nothing | Windows' own clipboard history owns it. Use `Ctrl+Alt+V` instead |
| Log file | `%APPDATA%\TapAct\logs\tapact.log` |

---

## עברית

### מה זה TapAct?

סוכן רקע ל-Windows שעוקב אחרי מה שאתם מעתיקים ומציע את הפעולה הבאה. מעתיקים מספר טלפון ונפתח חלון קטן עם וואטסאפ מוכן. מעתיקים מספר מעקב ונפתח דף המעקב של חברת המשלוחים. מעתיקים כתובת ונפתח ניווט. כל מה שהעתקתם נשמר גם בהיסטוריה מקומית עם חיפוש. הזיהוי וההיסטוריה נשארים במחשב. מה כן יוצא ממנו מפורט בסעיף "פרטיות" בהמשך.

### התקנה

1. מורידים `TapAct-Setup-<גרסה>.exe` מ[הגרסה האחרונה](https://github.com/ofirshudari1-ship-it/tapact/releases/latest).
2. מריצים. ההתקנה מבקשת הרשאת מנהל פעם אחת ומאפשרת לבחור שפה (עברית או אנגלית). אחרי זה TapAct רץ כמשתמש רגיל, בלי חלון הרשאה בכל הפעלה, ו"הפעלה אוטומטית עם Windows" (הגדרות > כללי) באמת פותחת אותו בכניסה ל-Windows. עדכון מבקש הרשאת מנהל פעם אחת בזמן ההתקנה.
3. TapAct עולה במגש המערכת. בהפעלה הראשונה נפתח מדריך קצר בשפת ה-Windows שלכם.
4. TapAct בודק עדכונים בהפעלה וכל כ-6 שעות, מוריד אותם בשקט ושואל לפני שהוא מופעל מחדש. אם בוחרים "אחר כך", העדכון מותקן כשיוצאים מ-TapAct, ואת TapAct מפעילים שוב בעצמכם. בהגדרות ▸ אודות ▸ עדכונים רואים את המצב ואפשר ללחוץ "בדוק עדכונים עכשיו".
5. אם האפליקציה הישנה ActionClip מותקנת, ההתקנה מציעה להסיר אותה (ברירת המחדל: לא). כששניהם רצים, כל העתקה פותחת שתי חלוניות.

### שימוש יומיומי

| מה עושים | מה TapAct עושה |
|---|---|
| מעתיקים מספר טלפון | נפתח חלון קטן ליד הסמן עם וואטסאפ והודעה מוכנה. הוא נסגר לבד אחרי 7 שניות, ונשאר פתוח כשהעכבר עליו או כשמקלידים בו. אחרי הלחיצה על וואטסאפ הוא נסגר לבד, כשוואטסאפ הוא הערוץ היחיד שמופעל |
| מעתיקים מספר מעקב, כתובת או קישור | נפתח חלון פעולה קטן באותה צורה |
| מעתיקים טקסט ארוך שבמקרה מכיל מספר | לא נפתח חלון (הוא רק נשמר בהיסטוריה) |
| `Ctrl+Alt+P` | פותח את החלון על מה שבלוח, בכל רגע |
| `Win+V` או `Ctrl+Alt+V` | פותח את היסטוריית הלוח (`Win+V` עובד רק אם היסטוריית הלוח של Windows כבויה) |

### מתי החלון לא נפתח (בכוונה)

- ההעתקה היא טקסט ארוך ולא בעיקר מספר טלפון (עד כ-40 תווים לטלפון), או מספר רגיל כמו ת.ז. או מספר חשבונית.
- TapAct עצמו הניח את הטקסט בלוח (למשל הדבקה מההיסטוריה), או שהעתקתם בתוך חלון של TapAct.
- העתקתם את אותו דבר לפני פחות מ-10 שניות (ההמתנה נקבעת בהגדרות ▸ הגדרות כלליות, ו-0 אומר בלי המתנה), או שהעתקתם את אותו טקסט בדיוק פעמיים ברצף, ש-TapAct לא רואה כהעתקה חדשה: העתיקו משהו אחר באמצע, או לחצו `Ctrl+Alt+P`.
- שעות שקט פעילות, הניטור מושהה, או שהשהיתם את החלון.
- נפתחו כמה חלונות ב-20 שניות (למשל העתקת עמודה של מספרים): החלונות נעצרים לדקה, והכול ממשיך להישמר בהיסטוריה.

### איפה נפתח וואטסאפ

כברירת מחדל השיחה נפתחת ב-WhatsApp Web בדפדפן. בהגדרות ▸ הגדרות כלליות ▸ "איפה נפתח וואטסאפ" אפשר לבחור במקום זה את אפליקציית WhatsApp למחשב (אם היא לא מותקנת, ייפתח WhatsApp Web), או את הקישור wa.me.

### השהיה וסגירה

ליד ה-X בכל חלון יש כפתור השהיה: 15 דקות, שעה, עד מחר ב-08:00, או "אל תציג יותר את הסוג הזה". בזמן ההשהיה ההיסטוריה ממשיכה להירשם והקיצור הידני ממשיך לעבוד. תפריט המגש מציג את ההשהיה ומאפשר לחזור. סוג שכיביתם אפשר להדליק שוב בהגדרות ▸ סוגי זיהוי.

### הגדרות

לחיצה ימנית על סמל המגש ▸ הגדרות. הלשוניות: תבניות הודעה (אפשר להשתמש ב-`{שם}` או `{name}` לשם הלקוח), סוגי זיהוי, כללים מותאמים אישית, הגדרות כלליות (כפתור שמירה אחד), קיצורי מקלדת, תגיות אוטומטיות, הגדרות לידים, היסטוריית לוח, היסטוריית שליחות, אודות.

### פרטיות

אין שרת של TapAct, אין חשבון ואין אנליטיקס. הזיהוי והיסטוריית הלוח רצים על המחשב שלכם. מה יוצא ממנו: בדיקת העדכונים (GitHub); הקישור שלוחצים עליו, שנושא את המספר, הכתובת או מספר המעקב שפעלתם עליהם (WhatsApp Web, `wa.me` או אפליקציית וואטסאפ, Maps, Waze, דף מעקב); ורק אם הדלקתם אותם ב"הגדרות לידים": ה-webhook, Slack או המייל שלכם, וניקוי ה-AI האופציונלי (Anthropic, עם מפתח API משלכם, שנשמר כטקסט רגיל בקובץ ההגדרות). המדיניות המלאה: PRIVACY.md.

### פתרון תקלות

| תסמין | פתרון |
|---|---|
| שום דבר לא קופץ | בדקו בתפריט המגש אם הניטור מושהה. אחר כך בדקו בהגדרות ▸ סוגי זיהוי ושעות שקט |
| עבד ואז הפסיק | צאו מהמגש (יציאה), פתחו את TapAct מחדש ועדכנו לגרסה האחרונה |
| `Win+V` לא עושה כלום | היסטוריית הלוח של Windows תופסת אותו. השתמשו ב-`Ctrl+Alt+V` |
| קובץ לוג | `%APPDATA%\TapAct\logs\tapact.log` |
