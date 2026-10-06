// template-fill.js - shared by the main process (require) and the popup
// renderer (plain <script>, exposes window.TapActTemplate). Message templates
// may use {שם} or {name} for the lead's name; both are filled everywhere.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TapActTemplate = api;
}(typeof self !== 'undefined' ? self : this, function () {
  const NAME_TOKENS = ['{שם}', '{name}', '{Name}', '{NAME}'];

  function replaceNamePlaceholders(text, name) {
    const value = String(name || '').trim();
    let out = String(text == null ? '' : text);
    for (const token of NAME_TOKENS) out = out.split(token).join(value);
    return out;
  }

  // Popup flavour: also tidies the gaps left when the name is empty.
  function fillMessageTemplate(text, name) {
    return replaceNamePlaceholders(text, name)
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.!?:;])/g, '$1')
      .trim();
  }

  return { NAME_TOKENS, replaceNamePlaceholders, fillMessageTemplate };
}));
