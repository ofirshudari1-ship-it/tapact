// Corpus regression test for phone detection: formats the reps actually paste (unicode dashes,
// bidi marks, NBSP, +972 (0)..., 00-prefixed, glued numbers) and strings that must NOT be a phone.
const { findPhone, normalizeText } = require('../src/lib/phone');
const { findGenericAction } = require('../src/lib/detectors');
const { classifyCopy } = require('../src/lib/detect-order');
const { chromeFindPhone } = require('./helpers/extension-phone');

const MOBILE = '972501234567';
const MOBILE2 = '972521234567';

// [input, expected normalized digits]
const POSITIVE = [
  ['0501234567', MOBILE], ['050-1234567', MOBILE], ['050 123 4567', MOBILE], ['050.123.4567', MOBILE],
  ['(050) 123-4567', MOBILE], ['050-123-4567', MOBILE], ['+972501234567', MOBILE], ['+972-50-123-4567', MOBILE],
  ['+972 50 123 4567', MOBILE], ['972501234567', MOBILE], ['00972501234567', MOBILE], ['00972-50-1234567', MOBILE],
  ['tel:+972501234567', MOBILE], ['tel:0501234567', MOBILE], ['tel: 050-1234567', MOBILE],
  ['+972 (0)50 123 4567', MOBILE], ['+972(0)501234567', MOBILE], ['+972 (0) 50-123-4567', MOBILE], ['+972-050-1234567', MOBILE],
  // unicode dashes and spaces
  ['050‑1234567', MOBILE], ['050–1234567', MOBILE], ['050—1234567', MOBILE], ['050−1234567', MOBILE],
  ['050‐123‑4567', MOBILE], ['050 1234567', MOBILE], ['050 123 4567', MOBILE], ['050 123 4567', MOBILE],
  // bidi / zero-width marks around or inside
  ['‏050-1234567‎', MOBILE], ['‪050-1234567‬', MOBILE], ['⁦050-1234567⁩', MOBILE],
  ['‎+972 50 123 4567', MOBILE], ['050-‏1234567', MOBILE], ['﻿0501234567', MOBILE],
  // glued / neighbouring numbers
  ['5\t0501234567', MOBILE], ['12 050-1234567', MOBILE], ['050-1234567\t052-7654321', MOBILE], ['0501234567 0521234567', MOBILE],
  ['0501234567\n0521234567', MOBILE], ['0501234567;0521234567', MOBILE], ['0521234567 0501234567', MOBILE2],
  ['חיוג: 0501234567 או 0521234567', MOBILE], ['1 0501234567', MOBILE], ['2026 0501234567', MOBILE],
  // inside text
  ['שלום, אנא התקשר אל 050-123-4567 בהקדם', MOBILE], ['Call me on 050 123 4567 please', MOBILE], ['טלפון: 0501234567.', MOBILE],
  ['יוסי כהן 0501234567', MOBILE], ['0501234567 Yossi Levi, Haifa', MOBILE], ['משלוח 0521234567', MOBILE2],
  ['שליח - 0521234567', MOBILE2], ['מספר מעקב? 0521234567', MOBILE2], ['name: Dana\nphone: 054-7654321', '972547654321'],
  // other mobile prefixes
  ['052-1234567', MOBILE2], ['053-1234567', '972531234567'], ['054-1234567', '972541234567'], ['055-1234567', '972551234567'],
  ['058-1234567', '972581234567'], ['059-1234567', '972591234567'],
  // bare 9-digit mobile (leading 0 dropped by Excel) with a real mobile second digit
  ['501234567', MOBILE], ['521234567', MOBILE2], ['541234567', '972541234567'], ['581234567', '972581234567'],
  // landlines and VoIP
  ['02-1234567', '97221234567'], ['03-1234567', '97231234567'], ['04-8123456', '97248123456'], ['08-9123456', '97289123456'],
  ['09-8123456', '97298123456'], ['072-1234567', '972721234567'], ['077-1234567', '972771234567'], ['+972-3-123-4567', '97231234567'],
  ['+972 (0)3 123 4567', '97231234567']
];

// international (non-Israeli) numbers: [input, digits]
const INTERNATIONAL = [
  ['+44 7911 123456', '447911123456'], ['+1 415-555-2671', '14155552671'], ['+351 912 345 678', '351912345678'],
  ['+48 512 345 678', '48512345678'], ['+49 1512 3456789', '4915123456789'], ['+7 912 345-67-89', '79123456789'],
  ['+212 612-345678', '212612345678'], ['0044 7911 123456', '447911123456'], ['00351912345678', '351912345678'],
  ['00 44 7911 123456', null], // a lone "00 44 ..." with a space after 00 is not treated as a prefix
  ['0049 1512 3456789', '4915123456789'], ['0048512345678', '48512345678'], ['+44 7911 123456', '447911123456'],
  ['tel:+447911123456', '447911123456']
];

const NEGATIVE = [
  '', ' ', 'שלום עולם', 'hello', '12345678', '1234567', '123456789', '12345', '2026-10-06', '06/10/2026', '06.10.2026',
  '₪1,234,567', '1,234,567.89', '$1234567', '19:45', '1234 5678', '0123456789', '9999999999',
  // 9 digits starting with 5 but a company/partnership prefix (51x) or other non-mobile second digit
  '512345678', '514123456', '517654321',
  // valid Israeli ID numbers (0-prefixed 9 digits passing the check digit)
  '034567891', '012345678', 'ת.ז. 034567891',
  // postal and carrier numbers
  'RR523456789IL', 'RR123456789IL', 'CP987654321IL', '1Z999AA10123456784', 'JD014600003456789012',
  // plates, IBAN, card numbers
  'IL620108000000099999999', '4111 1111 1111 1111', '12-345-67', '123-45-678',
  // too short / too long digit runs
  '0501234', '05012345678901', '+123', '+1234567890123456',
  // text with digits only as quantities
  '3 passports, Portugal', 'סה"כ 120 פריטים', 'order 77 of 120', 'v3.12.0', '10.0.0.1'
];

describe('phone corpus - positives', () => {
  test.each(POSITIVE)('%j -> %s', (input, expected) => {
    const r = findPhone(input);
    expect(r && r.normalized).toBe(expected);
  });
});

describe('phone corpus - international', () => {
  test.each(INTERNATIONAL)('%j -> %s', (input, expected) => {
    const r = findPhone(input);
    expect(r ? r.normalized : null).toBe(expected);
    if (expected) expect(r.international).toBe(true);
  });
});

describe('phone corpus - negatives', () => {
  test.each(NEGATIVE.map((s) => [s]))('%j is not a phone', (input) => {
    expect(findPhone(input)).toBeNull();
  });
});

describe('S10 / UPS numbers are never stolen by the phone detector', () => {
  test('with the tracking detector OFF, RR523456789IL is not a phone', () => {
    expect(findPhone('RR523456789IL')).toBeNull();
    expect(classifyCopy('RR523456789IL', { tracking: false, phone: true, address: true }, [], 'en')).toBeNull();
  });
  test('a real phone next to an S10 number is still found', () => {
    expect(findPhone('RR523456789IL 0521234567').normalized).toBe(MOBILE2);
  });
  test('with the tracking detector ON it is a tracking number', () => {
    const r = classifyCopy('RR523456789IL', { tracking: true, phone: true }, [], 'en');
    expect(r.kind).toBe('action');
    expect(r.action.type).toBe('tracking');
  });
});

describe('detection order', () => {
  const on = { tracking: true, address: true, url: true, email: true, phone: true };
  test('phone + short name/city note -> WhatsApp, not address', () => {
    const r = classifyCopy('0521234567 Yossi Levi, Haifa', on, [], 'en');
    expect(r.kind).toBe('phone');
    expect(r.phone.normalized).toBe(MOBILE2);
  });
  test('phone with an English street address (short) -> WhatsApp', () => {
    expect(classifyCopy('0521234567 12 Herzl St, Haifa', on, [], 'en').kind).toBe('phone');
  });
  test('shipping word + valid phone -> WhatsApp, not DHL', () => {
    expect(classifyCopy('משלוח 0521234567', on, [], 'he').kind).toBe('phone');
    expect(classifyCopy('שליח - 0501234567', on, [], 'he').kind).toBe('phone');
    expect(classifyCopy('דואר אלקטרוני 0501234567', on, [], 'he').kind).toBe('phone');
  });
  test('real tracking numbers keep winning', () => {
    const r = classifyCopy('מספר מעקב 1234567890', on, [], 'he');
    expect(r.kind).toBe('action');
    expect(r.action.type).toBe('tracking');
    expect(classifyCopy('tracking 123456789012', on, [], 'en').action.subtype).toBe('fedex');
    expect(classifyCopy('RR123456789IL', on, [], 'en').action.subtype).toBe('israelpost');
  });
  test('real addresses keep winning', () => {
    expect(classifyCopy('221B Baker Street, London', on, [], 'en').action.type).toBe('address');
    expect(classifyCopy('רחוב הרצל 12 תל אביב', on, [], 'he').action.type).toBe('address');
    expect(classifyCopy('דרך מנחם בגין 12 תל אביב', on, [], 'he').action.type).toBe('address');
  });
  test('a long text with a phone and a loose guess keeps the generic action', () => {
    const long = 'מספר מעקב 1234567890 והמשלוח יגיע בימים הקרובים, לבירורים 0501234567';
    expect(classifyCopy(long, on, [], 'he').kind).toBe('action');
  });
  test('phone detector OFF -> no phone result', () => {
    expect(classifyCopy('0501234567', { ...on, phone: false }, [], 'he')).toBeNull();
  });
});

describe('address false positives', () => {
  const addr = (s) => findGenericAction(s, { address: true }, [], 'en');
  test.each(['3 passports, Portugal', '5 days, Monday', '1 Passport, Poland and Portugal', 'Terms 12 items, total',
    'דיברתי דרך הטלפון 3 פעמים', 'עשיתי דרך הוואטסאפ 2 שיחות'])('%j is not an address', (s) => {
    expect(addr(s)).toBeNull();
  });
});

describe('normalizeText', () => {
  test('maps dashes, spaces, marks and digits', () => {
    expect(normalizeText('a‑b–c−d')).toBe('a-b-c-d');
    expect(normalizeText('a b c')).toBe('a b c');
    expect(normalizeText('‏x‎')).toBe('x');
    expect(normalizeText('٠١٢３')).toBe('0123');
  });
});

// The Chrome extension carries its own copy of the phone logic (it has no module system).
// Both must give the same answer for the whole corpus.
describe('chrome extension parity', () => {
  test.each(POSITIVE.concat(INTERNATIONAL.filter((x) => x[1])))('extension agrees on %j', (input, expected) => {
    expect(chromeFindPhone(input)).toBe(expected);
  });
  test.each(NEGATIVE.map((s) => [s]))('extension agrees: %j is not a phone', (input) => {
    expect(chromeFindPhone(input)).toBeNull();
  });
});
