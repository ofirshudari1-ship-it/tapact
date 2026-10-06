// settings-guard.js — validation for settings writes arriving over IPC from
// renderer windows (STANDARDS.md §11.4: treat every renderer as potentially
// compromised, validate every IPC input). Pure, so it's unit-testable
// without Electron.
//
// Before this existed, 'settings:save-one' (used by the welcome window)
// wrote ANY key/value straight into the store with no allowlist at all, and
// 'settings:save-settings' only filtered key names, not value types - so a
// renderer could persist e.g. `enabled: "yes"` or `language: "<anything>"`.

// Keys the renderers are allowed to write. Kept in sync with every key sent
// from settings/settings.js's onSave* handlers and welcome.html's toggles.
// If you add a new setting field, add its top-level key here too or it
// won't persist.
const SETTINGS_ALLOWLIST = new Set([
  'enabled', 'autoLaunch', 'pollMs', 'dedupeSeconds', 'autoCloseSeconds',
  'sendDedupeMinutes', 'autoRunAction', 'autoRunDelaySeconds',
  'actionPreferences', 'detectors',
  'closeToTray', 'soundOnDetect',
  'quietHours', 'historyEnabled', 'historyStorageLimit', 'historyPreviewLimit',
  'language', 'theme', 'trayClickAction', 'startPaused', 'autoInstallUpdates'
]);

const BOOLEAN_KEYS = new Set([
  'enabled', 'autoLaunch', 'autoRunAction', 'closeToTray',
  'soundOnDetect', 'historyEnabled', 'startPaused',
  'autoInstallUpdates'
]);

// key -> [min, max]; values are clamped into range, non-numbers dropped.
const NUMBER_RANGES = {
  pollMs: [200, 10000],
  dedupeSeconds: [0, 86400],
  autoCloseSeconds: [0, 3600],
  sendDedupeMinutes: [0, 10080],
  autoRunDelaySeconds: [1, 60],
  historyStorageLimit: [10, 5000],
  historyPreviewLimit: [10, 500]
};

const ENUMS = {
  language: ['he', 'en'],
  theme: ['dark', 'light'],
  trayClickAction: ['history', 'settings', 'none']
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns a new object containing only allowlisted keys whose values have
// the right shape. Invalid entries are dropped (not coerced into something
// the user never chose), except numbers, which are clamped into range.
function sanitizeSettingsPatch(patch) {
  const safe = {};
  if (!isPlainObject(patch)) return safe;
  for (const key of Object.keys(patch)) {
    if (!SETTINGS_ALLOWLIST.has(key)) continue;
    const value = patch[key];
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value === 'boolean') safe[key] = value;
    } else if (NUMBER_RANGES[key]) {
      const n = Number(value);
      if (typeof value !== 'boolean' && value !== null && value !== '' && Number.isFinite(n)) {
        const [min, max] = NUMBER_RANGES[key];
        safe[key] = Math.min(max, Math.max(min, n));
      }
    } else if (ENUMS[key]) {
      if (ENUMS[key].includes(value)) safe[key] = value;
    } else if (isPlainObject(value)) {
      // detectors / actionPreferences / quietHours - nested objects, merged
      // key-by-key by store.saveSettings.
      safe[key] = value;
    }
  }
  return safe;
}

module.exports = { SETTINGS_ALLOWLIST, sanitizeSettingsPatch };
