// Postal-address detection (Hebrew + English), for a "navigate there" action.

const { t } = require('../i18n-renderer');

// Hebrew: street-type word, then a street name, then a house number.
// e.g. "רחוב הרצל 12", "רח' ביאליק 5 תל אביב", "שדרות בן גוריון 44"
const HEBREW_ADDRESS_RE = /((?:רחוב|רח['׳]|שדרות|שד['׳]|כיכר|דרך(?!\s+ה(?:טלפון|וואטסאפ|ווטסאפ|מייל|אתר|מערכת|אפליקציה|טופס|שיחה|צ'אט|פייסבוק|אינטרנט)))\s+[א-ת"'׳\- ]{2,30}?\s+\d{1,4}[א-ת]?(?:\s*,?\s*[א-ת\- ]{2,20})?)/;

// English: house number + street name, then a comma-separated city.
// e.g. "221B Baker Street, London"
// The street part must contain a street word - "3 passports, Portugal" is a note, not an address.
const ENGLISH_ADDRESS_RE = /(?<![\w.])(\d{1,5}[A-Za-z]?\s+(?=[A-Za-z.\- ]{0,40}\b(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Lane|Ln|Dr|Drive|Way|Sq|Square|Pl|Place|Ct|Court|Hwy|Highway|Terrace|Close)\b)[A-Za-z][A-Za-z.\- ]{2,40},\s*[A-Za-z][A-Za-z.\- ]{2,30})/;

function findAddress(text, lang) {
  if (typeof text !== 'string' || !text) return null;

  const heMatch = text.match(HEBREW_ADDRESS_RE);
  const enMatch = !heMatch && text.match(ENGLISH_ADDRESS_RE);
  const match = heMatch || enMatch;
  if (!match) return null;

  const address = match[1].trim();
  const encoded = encodeURIComponent(address);

  return {
    type: 'address',
    raw: address,
    display: address,
    title: t(lang, 'detect.address.title'),
    actions: [
      { id: 'maps', label: t(lang, 'detect.address.action.maps'), url: `https://www.google.com/maps/search/?api=1&query=${encoded}` },
      { id: 'waze', label: t(lang, 'detect.address.action.waze'), url: `https://waze.com/ul?q=${encoded}&navigate=yes` }
    ]
  };
}

module.exports = { findAddress };
