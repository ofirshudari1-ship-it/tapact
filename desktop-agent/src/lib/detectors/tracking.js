// Shipment tracking-number detection.
// Two confidence tiers, mirroring the reasoning in phone.js:
//  - "self-evident" formats (S10 UPU postal standard, UPS 1Z, DHL "JD" AWB)
//    match anywhere in the copied text - their shape alone is distinctive
//    enough that false positives are very unlikely.
//  - "bare numeric" formats (FedEx, generic DHL) are common-looking digit
//    strings that could just as easily be an invoice or order number, so
//    they only count as a match when a shipping-related keyword also
//    appears in the copied text (e.g. the label a courier/webshop prints
//    next to the number: "מספר מעקב", "AWB", "tracking", "משלוח").

const { t } = require('../i18n-renderer');
const { normalizeIsraeliPhone, normalizeText } = require('../phone');

const KEYWORD_RE = /(מעקב|משלוח|חבילה|שליח|tracking|track|shipment|parcel|awb|consignment|courier|דואר)/i;

// `label` is a carrier-name lookup key (not display text) for carriers whose
// name is itself language-dependent (Israel Post - "דואר ישראל"/"Israel
// Post"; see detect.carrier.* below). Carriers whose brand name doesn't
// change across languages (UPS/DHL/FedEx) just use the brand name directly.
const CARRIERS = [
  {
    name: 'israelpost',
    labelKey: 'detect.carrier.israelpost',
    // UPU S10 standard: 2 letters, 9 digits, 2 letters (e.g. RR123456789IL)
    re: /\b([A-Z]{2}\d{9}[A-Z]{2})\b/,
    confident: true,
    url: (code) => `https://mypost.israelpost.co.il/itemtrace?itemcode=${encodeURIComponent(code)}`
  },
  {
    name: 'ups',
    label: 'UPS',
    re: /\b(1Z[0-9A-Z]{16})\b/i,
    confident: true,
    url: (code) => `https://www.ups.com/track?loc=he_IL&tracknum=${encodeURIComponent(code.toUpperCase())}`
  },
  {
    name: 'dhl-awb',
    label: 'DHL',
    // DHL eCommerce / Express modern AWB prefix
    re: /\b(JJD\d{16,18}|JD\d{16,18})\b/i,
    confident: true,
    url: (code) => `https://www.dhl.com/il-en/home/tracking.html?tracking-id=${encodeURIComponent(code)}`
  },
  {
    name: 'fedex',
    label: 'FedEx',
    re: /\b(\d{12}|\d{15}|\d{20})\b/,
    confident: false,
    url: (code) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(code)}`
  },
  {
    name: 'dhl',
    label: 'DHL',
    re: /\b(\d{10,11})\b/,
    confident: false,
    url: (code) => `https://www.dhl.com/il-en/home/tracking.html?tracking-id=${encodeURIComponent(code)}`
  }
];

function findTrackingNumber(text, lang) {
  if (typeof text !== 'string' || !text) return null;
  text = normalizeText(text);
  const hasKeyword = KEYWORD_RE.test(text);

  for (const carrier of CARRIERS) {
    if (!carrier.confident && !hasKeyword) continue;
    const m = text.match(carrier.re);
    if (!m) continue;
    const code = m[1];
    // A bare digit run that is a valid Israeli phone number (050..., 972...) is a phone, not a
    // FedEx/DHL number, even when the text says "משלוח" or "שליח" next to it.
    if (!carrier.confident && normalizeIsraeliPhone(code)) continue;
    const carrierLabel = carrier.labelKey ? t(lang, carrier.labelKey) : carrier.label;
    return {
      type: 'tracking',
      subtype: carrier.name,
      raw: code,
      display: code,
      title: t(lang, 'detect.tracking.title').replace('{carrier}', carrierLabel),
      actions: [
        { id: 'carrier', label: t(lang, 'detect.tracking.action.carrier').replace('{carrier}', carrierLabel), url: carrier.url(code) },
        { id: '17track', label: t(lang, 'detect.tracking.action.generic'), url: `https://www.17track.net/en#nums=${encodeURIComponent(code)}` }
      ]
    };
  }
  return null;
}

module.exports = { findTrackingNumber };
