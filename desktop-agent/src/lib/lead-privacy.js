// What a window may learn about the lead-capture settings.
//
// leadSettings holds secrets (AI api key, webhook URL and header value, Slack URL) and
// personal data (e-mail address, message template). Only the Settings window needs the
// real values. The phone popup needs to know which channels are on, the custom sources,
// the duplicate window and whether the AI button is usable - nothing else - and main.js
// always re-reads the trusted store when it actually sends, so nothing secret has to
// travel to a popup renderer.

const CHANNELS = ['channelWhatsapp', 'channelWebhook', 'channelSlack', 'channelEmail', 'channelCopy'];

function buildPopupLeadView(leadSettings) {
  const ls = leadSettings && typeof leadSettings === 'object' ? leadSettings : {};
  const view = {};
  for (const key of CHANNELS) view[key] = ls[key] === true;
  view.customSources = Array.isArray(ls.customSources)
    ? ls.customSources.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.slice(0, 60))
    : [];
  const hours = Number(ls.duplicateWindowHours);
  view.duplicateWindowHours = Number.isFinite(hours) && hours > 0 ? hours : 6;
  view.aiAvailable = ls.aiEnabled === true && typeof ls.aiApiKey === 'string' && ls.aiApiKey.trim() !== '';
  return view;
}

// True only when the IPC event came from the given (live) window's own web contents.
function isFromWindow(event, win) {
  if (!event || !event.sender || !win) return false;
  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return false;
  return !!win.webContents && event.sender === win.webContents;
}

module.exports = { buildPopupLeadView, isFromWindow, CHANNELS };
