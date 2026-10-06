const fs = require('fs');
const path = require('path');
const { UPDATE_CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, shouldRunPeriodicCheck, shouldPromptForVersion } = require('../src/lib/update-schedule');
const { withTimeout, REQUEST_TIMEOUT_MS, postJson } = require('../src/lib/lead-delivery');

describe('update schedule', () => {
  test('first check shortly after launch, then every 6 hours', () => {
    expect(FIRST_CHECK_DELAY_MS).toBeLessThanOrEqual(10000);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });
  test('periodic check is skipped while checking / downloading / an update is already ready', () => {
    for (const st of ['checking', 'downloading', 'ready']) expect(shouldRunPeriodicCheck(st)).toBe(false);
    for (const st of ['idle', 'up-to-date', 'error', undefined]) expect(shouldRunPeriodicCheck(st)).toBe(true);
  });
  test('the restart prompt is shown once per downloaded version', () => {
    expect(shouldPromptForVersion(null, '3.12.0')).toBe(true);
    expect(shouldPromptForVersion('3.12.0', '3.12.0')).toBe(false);
    expect(shouldPromptForVersion('3.12.0', '3.13.0')).toBe(true);
    expect(shouldPromptForVersion(null, undefined)).toBe(false);
  });
  test('main.js wires the periodic timer, keeps no Windows toast and never uses checkForUpdatesAndNotify', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    expect(main).toMatch(/setInterval\([\s\S]{0,200}shouldRunPeriodicCheck/);
    expect(main).not.toMatch(/autoUpdater\.checkForUpdatesAndNotify\(/);
    expect(main).toMatch(/quitAndInstall\(true, true\)/);
  });
});

describe('request timeouts (lead delivery)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test('a request that never answers is aborted and resolves with a timeout error', () => {
    const req = { abort: jest.fn() };
    const resolve = jest.fn();
    withTimeout(req, resolve);
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS + 1);
    expect(req.abort).toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith({ ok: false, error: 'timeout' });
  });
  test('an answer before the deadline wins and the timer is cleared', () => {
    const req = { abort: jest.fn() };
    const resolve = jest.fn();
    const settle = withTimeout(req, resolve);
    settle({ ok: true });
    jest.advanceTimersByTime(REQUEST_TIMEOUT_MS * 2);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ ok: true });
    expect(req.abort).not.toHaveBeenCalled();
  });
  test('postJson refuses non-http(s) URLs without sending anything', async () => {
    jest.useRealTimers();
    await expect(postJson('file:///C:/x', {})).resolves.toEqual({ ok: false, error: 'invalid-url' });
    await expect(postJson('javascript:alert(1)', {})).resolves.toEqual({ ok: false, error: 'invalid-url' });
  });
});

// The NSIS script cannot be run in jest (and must never be executed on a dev PC), so these checks
// pin the properties the v3.11 audit found broken. The script itself is compile-checked by
// electron-builder (npm run dist); its runtime behaviour needs a real install on a test machine.
describe('installer.nsh (static checks)', () => {
  const nsh = fs.readFileSync(path.join(__dirname, '..', 'build-resources', 'installer.nsh'), 'utf8');
  const uninstall = nsh.slice(nsh.indexOf('!macro customUnInstall'));
  const init = nsh.slice(nsh.indexOf('!macro customInit'), nsh.indexOf('Shared cross-product brand-color'));

  test('first-run language marker is written under the current user context, not ProgramData', () => {
    const before = init.slice(0, init.indexOf('first-run-language.txt'));
    expect(before).toMatch(/SetShellVarContext current/);
    expect(init).toMatch(/\$installMode == "all"[\s\S]{0,40}SetShellVarContext all/); // restored afterwards
  });
  test('uninstall does nothing at all during an upgrade (--updated) and never prompts in silent mode', () => {
    expect(uninstall).toMatch(/\$\{ifNot\} \$\{isUpdated\}/);
    expect(uninstall.indexOf('${ifNot} ${isUpdated}')).toBeLessThan(uninstall.indexOf('MessageBox'));
    expect(uninstall.indexOf('${ifNot} ${isUpdated}')).toBeLessThan(uninstall.indexOf('DeleteRegKey'));
    expect(uninstall).toMatch(/\$\{IfNot\} \$\{Silent\}[\s\S]*MessageBox/);
  });
  test('the delete-my-data answer defaults to No and deletes the real user profile folder', () => {
    expect(uninstall).toMatch(/MB_DEFBUTTON2/);
    const del = uninstall.slice(0, uninstall.indexOf('RMDir /r'));
    expect(del).toMatch(/SetShellVarContext current/);
  });
  test('ActionClip: detected via the Uninstall registry, asked with default No, skipped when silent or updating, never blocks', () => {
    expect(nsh).toMatch(/Function TapActFindActionClip/);
    expect(nsh).toMatch(/StrCmp \$R2 "ActionClip"/);
    expect(init).toMatch(/\$UpdateMode == "0"[\s\S]{0,40}AndIfNot\} \$\{Silent\}/);
    expect(init).toMatch(/MB_YESNO\|MB_ICONQUESTION\|MB_DEFBUTTON2 "\$\(ActionClipFoundText\)"/);
    expect(init).not.toMatch(/Abort|Quit/);
    expect(nsh).toMatch(/LangString ActionClipFoundText 1033/);
    expect(nsh).toMatch(/LangString ActionClipFoundText 1037/);
  });
  test('no inbound firewall rule is added any more (nothing listens)', () => {
    expect(nsh).not.toMatch(/add rule/);
  });
});
