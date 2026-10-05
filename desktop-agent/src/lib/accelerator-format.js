// Human-readable keyboard shortcut text for an Electron accelerator string.
// 'CommandOrControl+Alt+V' -> 'Ctrl+Alt+V', 'Super+V' -> 'Win+V'.
// Display only: the stored/registered value stays the Electron accelerator.
// Shared by main.js (tray menu) and the renderers (Settings, welcome) - loaded
// as a plain <script> in the renderers, so it is written as a UMD-style file
// like i18n-renderer.js.
(function (root) {
  const NAMES = {
    commandorcontrol: 'Ctrl',
    cmdorctrl: 'Ctrl',
    control: 'Ctrl',
    ctrl: 'Ctrl',
    super: 'Win',
    meta: 'Win',
    command: 'Win',
    cmd: 'Win',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift'
  };

  function formatAccelerator(accelerator) {
    if (typeof accelerator !== 'string' || !accelerator.trim()) return '';
    return accelerator
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => NAMES[part.toLowerCase()] || (part.length === 1 ? part.toUpperCase() : part))
      .join('+');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatAccelerator };
  } else {
    root.formatAccelerator = formatAccelerator;
  }
})(typeof window !== 'undefined' ? window : this);
