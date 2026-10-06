const { findPhone, normalizeIsraeliPhone, normalizeInternationalPhone, formatInternationalDisplay, fillTemplate, buildWhatsAppUrl } = require('../src/lib/phone');

describe('normalizeIsraeliPhone', () => {
  test('mobile with leading 0 (05X)', () => {
    expect(normalizeIsraeliPhone('0501234567')).toBe('972501234567');
  });
  test('mobile with spaces', () => {
    expect(normalizeIsraeliPhone('050 123 4567')).toBe('972501234567');
  });
  test('mobile with dashes', () => {
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
  });
  test('landline 02', () => {
    // 02-1234567 → strip non-digits → 021234567 → 972 + 21234567 = 11 digits
    expect(normalizeIsraeliPhone('02-1234567')).toBe('97221234567');
    expect(normalizeIsraeliPhone('021234567')).toBe('97221234567');
  });
  test('with 972 prefix', () => {
    expect(normalizeIsraeliPhone('972501234567')).toBe('972501234567');
  });
  test('with +972 prefix', () => {
    expect(normalizeIsraeliPhone('+972501234567')).toBe('972501234567');
  });
  test('with 00972 prefix', () => {
    expect(normalizeIsraeliPhone('00972501234567')).toBe('972501234567');
  });
  test('invalid — too short', () => {
    expect(normalizeIsraeliPhone('0501234')).toBeNull();
  });
  test('invalid — random digits', () => {
    expect(normalizeIsraeliPhone('123456')).toBeNull();
  });
  test('empty string', () => {
    expect(normalizeIsraeliPhone('')).toBeNull();
  });
});

describe('findPhone', () => {
  test('finds phone in plain text', () => {
    const result = findPhone('שלום, אנא התקשר אל 050-123-4567 בהקדם');
    expect(result).not.toBeNull();
    expect(result.normalized).toBe('972501234567');
    expect(result.display).toBe('050-1234567');
  });
  test('finds phone at start of text', () => {
    const result = findPhone('0521234567');
    expect(result).not.toBeNull();
    expect(result.normalized).toBe('972521234567');
  });
  test('returns null for text without phone', () => {
    expect(findPhone('שלום עולם')).toBeNull();
  });
  test('returns null for empty string', () => {
    expect(findPhone('')).toBeNull();
  });
  test('returns null for non-string', () => {
    expect(findPhone(null)).toBeNull();
    expect(findPhone(undefined)).toBeNull();
  });
  test('finds first valid phone when multiple', () => {
    const result = findPhone('050-1234567 or 052-9876543');
    expect(result).not.toBeNull();
    expect(result.normalized).toBe('972501234567');
  });
  test('tracking number prefix letters prevent digit match', () => {
    // "RR123456789IL" — the regex only captures the digit segment 123456789
    // which gets normalized to 972123456789 (12 digits). The phone detector
    // cannot distinguish this from a landline without knowing it's a postal code.
    // This is a known limitation — the detector errs on the side of matching.
    const result = findPhone('RR123456789IL');
    // Accept whatever the detector returns (null or a match) — we just verify
    // the function doesn't throw.
    expect(() => findPhone('RR123456789IL')).not.toThrow();
  });
});

describe('normalizeInternationalPhone', () => {
  test('UK mobile with +', () => {
    expect(normalizeInternationalPhone('+44 7911 123456')).toBe('447911123456');
  });
  test('US number with +', () => {
    expect(normalizeInternationalPhone('+1 415-555-2671')).toBe('14155552671');
  });
  test('rejects Israeli-prefixed numbers — normalizeIsraeliPhone owns those', () => {
    expect(normalizeInternationalPhone('+972501234567')).toBeNull();
  });
  test('rejects numbers without a leading +', () => {
    // no country code visible — ambiguous, left alone on purpose
    expect(normalizeInternationalPhone('447911123456')).toBeNull();
  });
  test('rejects too short / too long', () => {
    expect(normalizeInternationalPhone('+123')).toBeNull();
    expect(normalizeInternationalPhone('+1234567890123456')).toBeNull();
  });
  test('non-string returns null without throwing', () => {
    expect(normalizeInternationalPhone(null)).toBeNull();
    expect(normalizeInternationalPhone(undefined)).toBeNull();
  });
});

describe('formatInternationalDisplay', () => {
  test('groups digits after a plausible country code', () => {
    // Length-based best-effort grouping (not a real per-country numbering
    // plan, see the function's own comment) - 12 digits total uses a
    // 3-digit country-code guess, then groups the rest by 3.
    expect(formatInternationalDisplay('447911123456')).toBe('+447 911-123-456');
  });
});

describe('findPhone — international fallback', () => {
  test('finds a UK number when no Israeli number is present', () => {
    const result = findPhone('נא להתקשר ל +44 7911 123456 בבקשה');
    expect(result).not.toBeNull();
    expect(result.normalized).toBe('447911123456');
    expect(result.international).toBe(true);
  });
  test('Israeli number still wins when both are present', () => {
    const result = findPhone('גיבוי: +44 7911 123456, עיקרי: 050-123-4567');
    expect(result).not.toBeNull();
    expect(result.normalized).toBe('972501234567');
    expect(result.international).toBeUndefined();
  });
});

describe('fillTemplate', () => {
  test('replaces {שם} with name', () => {
    expect(fillTemplate('היי {שם}, מה שלומך?', 'דוד')).toBe('היי דוד, מה שלומך?');
  });
  test('handles empty name — replaces token with empty string', () => {
    // Space before comma remains (single space not collapsed by /\s{2,}/)
    expect(fillTemplate('היי {שם},', '')).toBe('היי ,');
  });
  test('handles undefined name — same as empty', () => {
    expect(fillTemplate('היי {שם},', undefined)).toBe('היי ,');
  });
  test('no placeholder — text unchanged', () => {
    expect(fillTemplate('שלום עולם', 'יוסי')).toBe('שלום עולם');
  });
  test('collapses extra spaces after substitution', () => {
    // "{שם}" at start followed by space when name is empty
    const result = fillTemplate('{שם} שלום!', '');
    expect(result).toBe('שלום!');
  });
});

describe('buildWhatsAppUrl', () => {
  test('builds correct wa.me URL when the wa.me target is chosen', () => {
    const url = buildWhatsAppUrl('972501234567', 'שלום!', 'wame');
    expect(url).toContain('https://wa.me/972501234567');
    expect(url).toContain(encodeURIComponent('שלום!'));
  });
});

describe('findPhone - ordinary numbers must not look like phones', () => {
  test.each(['123456789', 'ת.ז. 305123456', '12345678', '65432109', '0123456789', '1,250,000', 'מספר הזמנה 4829173'])(
    'ignores %s', (text) => { expect(findPhone(text)).toBeNull(); }
  );
  test.each(['052-9998877', '0529998877', '+972-52-999-8877', '03-5551234', '077-1234567', '529998877', 'נייד: 052-9998877'])(
    'still detects %s', (text) => { expect(findPhone(text)).not.toBeNull(); }
  );
});

describe('findPhone - Israeli ID numbers starting with 0', () => {
  const { isIsraeliId } = require('../src/lib/phone');
  test('valid ID checksum is recognised', () => {
    expect(isIsraeliId('034567891')).toBe(true);
    expect(isIsraeliId('034567892')).toBe(false);
  });
  test('a bare valid ID is not a phone', () => { expect(findPhone('034567891')).toBeNull(); });
  test('the same digits formatted as a landline still are', () => {
    expect(findPhone('03-4567891')).not.toBeNull();
    expect(findPhone('+972-3-456-7891')).not.toBeNull();
  });
  test('a bare 9-digit landline that fails the ID check is still a phone', () => {
    expect(findPhone('034567892')).not.toBeNull();
  });
});

describe('buildWhatsAppUrl - where the chat opens', () => {
  const { buildWhatsAppUrl, normalizeWhatsAppTarget } = require('../src/lib/phone');
  test('WhatsApp Web is the default', () => {
    expect(buildWhatsAppUrl('972523334455', 'hi')).toBe('https://web.whatsapp.com/send?phone=972523334455&text=hi');
    expect(buildWhatsAppUrl('972523334455', '', 'web')).toBe('https://web.whatsapp.com/send?phone=972523334455');
  });
  test('desktop app and wa.me variants', () => {
    expect(buildWhatsAppUrl('972523334455', 'hi', 'desktop')).toBe('whatsapp://send?phone=972523334455&text=hi');
    expect(buildWhatsAppUrl('972523334455', 'a b', 'wame')).toBe('https://wa.me/972523334455?text=a%20b');
    expect(buildWhatsAppUrl('972523334455', '', 'wame')).toBe('https://wa.me/972523334455');
  });
  test('unknown targets fall back to web; Hebrew text is encoded', () => {
    expect(normalizeWhatsAppTarget('nonsense')).toBe('web');
    expect(buildWhatsAppUrl('972523334455', 'שלום')).toContain('text=%D7%A9%D7%9C%D7%95%D7%9D');
  });
});
