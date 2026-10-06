// The one-line message shown after a clipboard-history import. UMD-style like
// i18n-renderer.js: a plain <script> in the history panel and require()-able in jest.
// `t(key)` is the caller's translator; `result` is what history-panel:import returns.
(function (root) {
  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  }

  function buildImportMessage(result, t) {
    if (!result || result.canceled) return null;
    if (result.unreadable || result.error) return { kind: 'error', text: t('clip.import.unreadable') };
    const limits = result.limits || { maxItems: 5000, maxText: 20000 };
    const imported = result.imported || 0;
    let head;
    if (imported === 1) head = t('clip.import.one');
    else if (imported > 1) head = fill(t('clip.import.done'), { n: imported });
    else if (result.duplicates > 0 && !result.invalid && !result.droppedByCap) head = t('clip.import.noneDup');
    else head = t('clip.import.none');
    const notes = [];
    if (result.linksRemoved > 0) notes.push(fill(t('clip.import.skippedLinks'), { n: result.linksRemoved }));
    if (result.droppedByCap > 0) notes.push(fill(t('clip.import.skippedCap'), { n: result.droppedByCap, max: limits.maxItems }));
    if (result.textTrimmed > 0) notes.push(fill(t('clip.import.skippedText'), { n: result.textTrimmed, max: limits.maxText }));
    if (result.invalid > 0) notes.push(fill(t('clip.import.skippedBad'), { n: result.invalid }));
    return { kind: imported > 0 ? 'ok' : 'none', text: [head, ...notes].join('. ') };
  }

  const api = { buildImportMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.importSummary = api;
})(typeof window !== 'undefined' ? window : this);
