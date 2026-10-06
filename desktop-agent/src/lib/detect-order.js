// Decides what a copied text is: a generic action (tracking / address / url / email / custom) or a
// phone number. Pure, so the order rules are unit-testable without Electron.
//
// Order: structured detectors first (they are the least prone to false positives), then phone -
// EXCEPT when the text is a short note around a valid Israeli phone number and the generic hit is
// only a loose guess (an address-looking fragment, or a bare-digit FedEx/DHL match next to a
// shipping word). "0521234567 Yossi Levi, Haifa" and "משלוח 0521234567" are phone numbers.

const { findGenericAction } = require('./detectors');
const { findPhone } = require('./phone');

const SHORT_TEXT_FOR_PHONE_PRIORITY = 60;
const CONFIDENT_TRACKING = new Set(['israelpost', 'ups', 'dhl-awb']);

function isLooseGuess(action) {
  if (!action) return false;
  if (action.type === 'address') return true;
  if (action.type === 'tracking') return !CONFIDENT_TRACKING.has(action.subtype);
  return false;
}

// -> { kind: 'action', action } | { kind: 'phone', phone } | null
function classifyCopy(text, detectors, customRules, lang) {
  if (typeof text !== 'string' || !text) return null;
  const enabled = detectors || {};
  const action = findGenericAction(text, enabled, customRules, lang);
  const phone = enabled.phone !== false ? findPhone(text) : null;
  if (action && phone && !phone.international && text.length <= SHORT_TEXT_FOR_PHONE_PRIORITY && isLooseGuess(action)) {
    return { kind: 'phone', phone };
  }
  if (action) return { kind: 'action', action };
  if (phone) return { kind: 'phone', phone };
  return null;
}

module.exports = { classifyCopy, SHORT_TEXT_FOR_PHONE_PRIORITY };
