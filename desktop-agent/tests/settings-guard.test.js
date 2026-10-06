// settings-guard.test.js — IPC settings-write validation (STANDARDS.md §11.4).

const { sanitizeSettingsPatch, SETTINGS_ALLOWLIST } = require('../src/lib/settings-guard');

describe('sanitizeSettingsPatch', () => {
  test('drops keys that are not on the allowlist', () => {
    expect(sanitizeSettingsPatch({ welcomeSeen: true, aiApiKey: 'x', widgetPosition: { x: 1, y: 2 } }))
      .toEqual({});
  });

  test('keeps valid booleans and drops non-boolean values for boolean keys', () => {
    expect(sanitizeSettingsPatch({ enabled: false, startPaused: true })).toEqual({ enabled: false, startPaused: true });
    expect(sanitizeSettingsPatch({ enabled: 'yes', startPaused: 1 })).toEqual({});
  });

  test('accepts the autoInstallUpdates toggle as a boolean', () => {
    expect(sanitizeSettingsPatch({ autoInstallUpdates: false })).toEqual({ autoInstallUpdates: false });
    expect(sanitizeSettingsPatch({ autoInstallUpdates: 'yes' })).toEqual({});
  });

  test('accepts only known enum values for language / theme / trayClickAction', () => {
    expect(sanitizeSettingsPatch({ language: 'he', theme: 'light', trayClickAction: 'none' }))
      .toEqual({ language: 'he', theme: 'light', trayClickAction: 'none' });
    expect(sanitizeSettingsPatch({ language: 'fr', theme: '<script>', trayClickAction: 'quit' })).toEqual({});
  });

  test('clamps numbers into range and drops non-numeric values', () => {
    expect(sanitizeSettingsPatch({ pollMs: 10, historyStorageLimit: 999999, autoRunDelaySeconds: '5' }))
      .toEqual({ pollMs: 200, historyStorageLimit: 5000, autoRunDelaySeconds: 5 });
    expect(sanitizeSettingsPatch({ pollMs: 'fast', dedupeSeconds: null, autoCloseSeconds: true })).toEqual({});
  });

  test('passes nested setting objects through (merged key-by-key by the store)', () => {
    const quietHours = { enabled: true, start: '18:00', end: '08:00' };
    expect(sanitizeSettingsPatch({ quietHours })).toEqual({ quietHours });
    expect(sanitizeSettingsPatch({ detectors: ['phone'] })).toEqual({});
  });

  test('returns an empty object for non-object input', () => {
    expect(sanitizeSettingsPatch(null)).toEqual({});
    expect(sanitizeSettingsPatch('enabled')).toEqual({});
    expect(sanitizeSettingsPatch([1, 2])).toEqual({});
  });

  test('allowlist covers every key the Settings UI and welcome window send', () => {
    for (const key of ['enabled', 'autoLaunch', 'closeToTray',
      'soundOnDetect', 'startPaused', 'trayClickAction', 'pollMs', 'dedupeSeconds',
      'autoCloseSeconds', 'sendDedupeMinutes', 'quietHours', 'detectors', 'historyEnabled',
      'historyStorageLimit', 'historyPreviewLimit', 'actionPreferences', 'autoRunAction',
      'autoRunDelaySeconds', 'language', 'theme', 'autoInstallUpdates']) {
      expect(SETTINGS_ALLOWLIST.has(key)).toBe(true);
    }
  });

  test('removed settings and main-process-only keys are not writable from a renderer', () => {
    for (const key of ['startMinimized', 'showTrayNotification', 'snoozeUntil', 'migrationsApplied', 'trayHideHintSeen']) {
      expect(SETTINGS_ALLOWLIST.has(key)).toBe(false);
    }
    expect(sanitizeSettingsPatch({ snoozeUntil: 9999999999999, showTrayNotification: true })).toEqual({});
  });
});
