# TapAct - User Guide / מדריך משתמש

Current version: 3.10.1. Download: https://github.com/ofirshudari1-ship-it/tapact/releases/latest

## English

### What is TapAct?

A Windows background agent that watches what you copy and offers the right next action. Copy a phone number and a small window opens with WhatsApp ready. Copy a tracking number and it opens the courier's page. Copy an address and it opens navigation. Everything you copy is also kept in a searchable local clipboard history. Nothing leaves your computer except the link it opens in your browser.

### Install

1. Download `TapAct-Setup-<version>.exe` from the [latest release](https://github.com/ofirshudari1-ship-it/tapact/releases/latest).
2. Run it. The installer asks for administrator permission and lets you choose the language (English or Hebrew).
3. TapAct starts in the system tray. On the first run a short welcome guide opens in the language of your Windows.
4. Updates arrive by themselves; Settings > About > Updates shows the status and has "Check for updates now".

### Daily use

| You do | TapAct does |
|---|---|
| Copy a phone number | A small window opens next to the cursor with WhatsApp and a ready message. It closes by itself after 7 seconds, and stays open while the mouse is on it or you are typing in it |
| Copy a tracking number, address or link | A small action window opens the same way |
| Copy a long text that happens to contain a number | No window (it is only saved to history) |
| `Ctrl+Alt+P` | Opens the window for whatever is on the clipboard, any time |
| `Win+V` or `Ctrl+Alt+V` | Opens the clipboard history (`Win+V` only works if Windows' own clipboard history is turned off) |

### When the window does not open (on purpose)

- The copy is long text, not mainly a phone number (up to about 40 characters for a phone), or an ordinary number such as an ID or invoice number.
- TapAct itself put it on the clipboard (for example pasting from history), or you copied inside a TapAct window.
- You copied the same thing less than 10 seconds ago.
- Quiet hours are on, monitoring is paused, or you snoozed the popup.
- Several windows opened within 20 seconds (for example copying a column of numbers): popups pause for a minute, everything is still saved to history.

### Snooze and close

Next to the X on every popup there is a snooze button: 15 minutes, 1 hour, until tomorrow 08:00, or "stop showing this type". While snoozed, history keeps recording and the manual shortcut still works. The tray menu shows the snooze and lets you resume. A type you turned off can be turned on again in Settings > Detection types.

### Settings

Right-click the tray icon > Settings. Main tabs: Message templates (use `{name}` or `{שם}` for the customer's name), Detection types, Custom rules, General settings (one Save button), Keyboard shortcuts, Auto tags, Lead settings, Clipboard history, Send history, About.

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

סוכן רקע ל-Windows שעוקב אחרי מה שאתם מעתיקים ומציע את הפעולה הבאה. מעתיקים מספר טלפון ונפתח חלון קטן עם וואטסאפ מוכן. מעתיקים מספר מעקב ונפתח דף המעקב של חברת המשלוחים. מעתיקים כתובת ונפתח ניווט. כל מה שהעתקתם נשמר גם בהיסטוריה מקומית עם חיפוש. שום דבר לא יוצא מהמחשב, חוץ מהקישור שנפתח בדפדפן.

### התקנה

1. מורידים `TapAct-Setup-<גרסה>.exe` מ[הגרסה האחרונה](https://github.com/ofirshudari1-ship-it/tapact/releases/latest).
2. מריצים. ההתקנה מבקשת הרשאת מנהל ומאפשרת לבחור שפה (עברית או אנגלית).
3. TapAct עולה במגש המערכת. בהפעלה הראשונה נפתח מדריך קצר בשפת ה-Windows שלכם.
4. עדכונים מגיעים לבד. בהגדרות ▸ אודות ▸ עדכונים רואים את המצב ואפשר ללחוץ "בדוק עדכונים עכשיו".

### שימוש יומיומי

| מה עושים | מה TapAct עושה |
|---|---|
| מעתיקים מספר טלפון | נפתח חלון קטן ליד הסמן עם וואטסאפ והודעה מוכנה. הוא נסגר לבד אחרי 7 שניות, ונשאר פתוח כשהעכבר עליו או כשמקלידים בו |
| מעתיקים מספר מעקב, כתובת או קישור | נפתח חלון פעולה קטן באותה צורה |
| מעתיקים טקסט ארוך שבמקרה מכיל מספר | לא נפתח חלון (הוא רק נשמר בהיסטוריה) |
| `Ctrl+Alt+P` | פותח את החלון על מה שבלוח, בכל רגע |
| `Win+V` או `Ctrl+Alt+V` | פותח את היסטוריית הלוח (`Win+V` עובד רק אם היסטוריית הלוח של Windows כבויה) |

### מתי החלון לא נפתח (בכוונה)

- ההעתקה היא טקסט ארוך ולא בעיקר מספר טלפון (עד כ-40 תווים לטלפון), או מספר רגיל כמו ת.ז. או מספר חשבונית.
- TapAct עצמו הניח את הטקסט בלוח (למשל הדבקה מההיסטוריה), או שהעתקתם בתוך חלון של TapAct.
- העתקתם את אותו דבר לפני פחות מ-10 שניות.
- שעות שקט פעילות, הניטור מושהה, או שהשהיתם את החלון.
- נפתחו כמה חלונות ב-20 שניות (למשל העתקת עמודה של מספרים): החלונות נעצרים לדקה, והכול ממשיך להישמר בהיסטוריה.

### השהיה וסגירה

ליד ה-X בכל חלון יש כפתור השהיה: 15 דקות, שעה, עד מחר ב-08:00, או "אל תציג יותר את הסוג הזה". בזמן ההשהיה ההיסטוריה ממשיכה להירשם והקיצור הידני ממשיך לעבוד. תפריט המגש מציג את ההשהיה ומאפשר לחזור. סוג שכיביתם אפשר להדליק שוב בהגדרות ▸ סוגי זיהוי.

### הגדרות

לחיצה ימנית על סמל המגש ▸ הגדרות. הלשוניות: תבניות הודעה (אפשר להשתמש ב-`{שם}` או `{name}` לשם הלקוח), סוגי זיהוי, כללים מותאמים אישית, הגדרות כלליות (כפתור שמירה אחד), קיצורי מקלדת, תגיות אוטומטיות, הגדרות לידים, היסטוריית לוח, היסטוריית שליחות, אודות.

### פתרון תקלות

| תסמין | פתרון |
|---|---|
| שום דבר לא קופץ | בדקו בתפריט המגש אם הניטור מושהה. אחר כך בדקו בהגדרות ▸ סוגי זיהוי ושעות שקט |
| עבד ואז הפסיק | צאו מהמגש (יציאה), פתחו את TapAct מחדש ועדכנו לגרסה האחרונה |
| `Win+V` לא עושה כלום | היסטוריית הלוח של Windows תופסת אותו. השתמשו ב-`Ctrl+Alt+V` |
| קובץ לוג | `%APPDATA%\TapAct\logs\tapact.log` |
