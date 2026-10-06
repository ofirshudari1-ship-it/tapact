const {
  nudgeInside, clampPoint,
  createCursorTrail, pickCopySample, computeAnchoredPopupPosition, computeFitBounds, boundsCorrection, rectContains, fitsInside
} = require('../src/lib/popup-placement');

const wa = { x: 0, y: 0, width: 1920, height: 1040 };
const W = 320, H = 230;
const rectAt = (pos, w = W, h = H) => ({ x: pos.x, y: pos.y, width: w, height: h });

describe('pickCopySample / cursor trail', () => {
  test('uses the sample from the tick before the detecting one', () => {
    const samples = [{ x: 100, y: 100, t: 1000 }, { x: 110, y: 105, t: 1400 }, { x: 900, y: 700, t: 1800 }];
    expect(pickCopySample(samples, 1800)).toEqual({ x: 110, y: 105, t: 1400 });
  });
  test('falls back to the newest sample when there is no earlier one', () => {
    expect(pickCopySample([{ x: 5, y: 6, t: 1000 }], 1000)).toEqual({ x: 5, y: 6, t: 1000 });
    expect(pickCopySample([], 1000)).toBeNull();
  });
  test('trail drops old samples and caps its length', () => {
    const trail = createCursorTrail();
    for (let i = 0; i < 100; i++) trail.push({ x: i, y: i, t: i * 100 });
    expect(trail.size()).toBeLessThanOrEqual(40);
    expect(trail.pick(99 * 100).t).toBe(98 * 100);
    trail.push({ x: 1, y: 1, t: 100 * 100 + 60000 });
    expect(trail.size()).toBe(1);
  });
});

describe('computeAnchoredPopupPosition', () => {
  test('LTR: below-right of the point, 14px away', () => {
    const p = { x: 500, y: 400 };
    expect(computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa })).toEqual({ x: 514, y: 414 });
  });
  test('RTL: below-left of the point', () => {
    const p = { x: 800, y: 400 };
    expect(computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa, rtl: true })).toEqual({ x: 800 - 14 - W, y: 414 });
  });
  test('flips above when there is no room below', () => {
    const p = { x: 500, y: 1000 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa });
    expect(pos.y).toBe(1000 - 14 - H);
    expect(pos.x).toBe(514);
  });
  test('flips to the left side near the right edge', () => {
    const p = { x: 1900, y: 300 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa });
    expect(pos.x).toBe(1900 - 14 - W);
    expect(pos.y).toBe(314);
  });
  test('RTL flips to the right side near the left edge', () => {
    const p = { x: 20, y: 300 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa, rtl: true });
    expect(pos.x).toBe(34);
  });
  test('every corner of the screen: inside the work area and never on the cursor', () => {
    const corners = [{ x: 0, y: 0 }, { x: 1919, y: 0 }, { x: 0, y: 1039 }, { x: 1919, y: 1039 }, { x: 960, y: 520 }];
    for (const rtl of [false, true]) {
      for (const point of corners) {
        const pos = computeAnchoredPopupPosition({ point, width: W, height: H, workArea: wa, rtl });
        const r = rectAt(pos);
        expect(fitsInside(r, wa)).toBe(true);
        expect(rectContains(r, point)).toBe(false);
      }
    }
  });
  test('secondary monitor with negative coordinates', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 };
    const p = { x: -1910, y: 20 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: left });
    const r = rectAt(pos);
    expect(fitsInside(r, left)).toBe(true);
    expect(rectContains(r, p)).toBe(false);
    const p2 = { x: -5, y: 1030 };
    const pos2 = computeAnchoredPopupPosition({ point: p2, width: W, height: H, workArea: left });
    expect(fitsInside(rectAt(pos2), left)).toBe(true);
    expect(rectContains(rectAt(pos2), p2)).toBe(false);
  });
  test('second monitor above the primary (negative y)', () => {
    const top = { x: 0, y: -1080, width: 1920, height: 1040 };
    const p = { x: 300, y: -1075 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: top });
    expect(fitsInside(rectAt(pos), top)).toBe(true);
  });
  test('tiny work area: stays inside, does not throw, avoids the cursor when it can', () => {
    const tiny = { x: 0, y: 0, width: 400, height: 300 };
    const p = { x: 350, y: 150 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: tiny });
    expect(fitsInside(rectAt(pos), tiny)).toBe(true);
    expect(rectContains(rectAt(pos), p)).toBe(false);
  });
  test('work area smaller than the popup clamps instead of throwing', () => {
    const tiny = { x: 100, y: 100, width: 200, height: 100 };
    const pos = computeAnchoredPopupPosition({ point: { x: 150, y: 150 }, width: W, height: H, workArea: tiny });
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
  test('works with DIP coordinates of a 150% scaled display (1280x680 work area)', () => {
    const scaled = { x: 0, y: 0, width: 1280, height: 680 };
    const p = { x: 1270, y: 670 };
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: scaled });
    expect(fitsInside(rectAt(pos), scaled)).toBe(true);
    expect(rectContains(rectAt(pos), p)).toBe(false);
  });
});

describe('computeFitBounds', () => {
  test('keeps the anchor edge: when growing near the bottom it flips above instead of covering the cursor', () => {
    const p = { x: 500, y: 700 };
    const b = computeFitBounds({ point: p, width: W, newHeight: 420, workArea: wa });
    expect(fitsInside(b, wa)).toBe(true);
    expect(rectContains(b, p)).toBe(false);
    expect(b.height).toBe(420);
  });
  test('shrinks below the anchor and stays adjacent', () => {
    const p = { x: 500, y: 300 };
    const b = computeFitBounds({ point: p, width: W, newHeight: 160, workArea: wa });
    expect(b.y).toBe(314);
    expect(b.height).toBe(160);
  });
  test('height is capped to the work area and has a floor', () => {
    expect(computeFitBounds({ point: { x: 10, y: 10 }, width: W, newHeight: 5000, workArea: wa }).height).toBe(1040 - 16);
    expect(computeFitBounds({ point: { x: 10, y: 10 }, width: W, newHeight: 10, workArea: wa }).height).toBe(120);
  });
});

describe('boundsCorrection', () => {
  const want = { x: 10, y: 20, width: 300, height: 200 };
  test('null when the actual bounds match (within 1px)', () => {
    expect(boundsCorrection(want, { x: 11, y: 20, width: 300, height: 199 })).toBeNull();
  });
  test('returns the intended bounds when the OS drifted them', () => {
    expect(boundsCorrection(want, { x: 10, y: 20, width: 450, height: 300 })).toEqual(want);
  });
});

describe('cursor outside the work area (taskbar) and 1-2px OS rounding', () => {
  test('cursor over the taskbar still gets a popup above it, inside the work area', () => {
    const p = { x: 300, y: 1060 }; // below wa bottom (1040)
    const pos = computeAnchoredPopupPosition({ point: p, width: W, height: H, workArea: wa });
    expect(fitsInside(rectAt(pos), wa)).toBe(true);
  });
  test('clampPoint pulls a point into the work area', () => {
    expect(clampPoint({ x: -50, y: 5000 }, wa)).toEqual({ x: 0, y: 1039 });
    expect(clampPoint({ x: 10, y: 10 }, wa)).toEqual({ x: 10, y: 10 });
  });
  test('nudgeInside corrects a window that the OS made 1-2px larger', () => {
    expect(nudgeInside({ x: 0, y: 874, width: 322, height: 231 }, { x: 0, y: 0, width: 2048, height: 1104 })).toEqual({ x: 0, y: 873 });
    expect(nudgeInside({ x: 1727, y: 20, width: 322, height: 231 }, { x: 0, y: 0, width: 2048, height: 1104 })).toEqual({ x: 1726, y: 20 });
    expect(nudgeInside({ x: 10, y: 10, width: 322, height: 231 }, wa)).toBeNull();
  });
});
