// When to check for updates. TapAct runs all day in the tray, so one check per launch is not
// enough: a check also runs every few hours. Pure helpers (no Electron) so the rules are testable.

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const FIRST_CHECK_DELAY_MS = 5000; // shortly after launch

// A periodic check is skipped while one is already running or downloading, and once an update is
// downloaded and waiting (the user already got the restart prompt; it also installs on quit).
function shouldRunPeriodicCheck(state) {
  return !(state === 'checking' || state === 'downloading' || state === 'ready');
}

// The restart prompt is shown once per downloaded version, not again at every periodic check.
function shouldPromptForVersion(notifiedVersion, version) {
  return !!version && notifiedVersion !== version;
}

module.exports = { UPDATE_CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, shouldRunPeriodicCheck, shouldPromptForVersion };
