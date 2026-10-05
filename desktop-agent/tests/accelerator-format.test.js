const { formatAccelerator } = require('../src/lib/accelerator-format');

describe('formatAccelerator', () => {
  test.each([
    ['CommandOrControl+Alt+V', 'Ctrl+Alt+V'],
    ['CommandOrControl+Alt+P', 'Ctrl+Alt+P'],
    ['Super+V', 'Win+V'],
    ['CmdOrCtrl+Shift+k', 'Ctrl+Shift+K'],
    ['Alt+F4', 'Alt+F4'],
    ['Super+Alt+Space', 'Win+Alt+Space']
  ])('%s -> %s', (input, expected) => {
    expect(formatAccelerator(input)).toBe(expected);
  });

  test('empty / invalid input gives an empty string', () => {
    expect(formatAccelerator('')).toBe('');
    expect(formatAccelerator(null)).toBe('');
    expect(formatAccelerator(undefined)).toBe('');
  });
});
