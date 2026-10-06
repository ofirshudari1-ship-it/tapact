// popup-placement.js - pure geometry for "open the popup right where the copy
// happened". All coordinates are DIP (what Electron's screen.* and
// BrowserWindow bounds use), so DPI scaling needs no conversion here.

const TRAIL_MAX_AGE_MS = 5000;
const TRAIL_MAX_LEN = 40;

// Short history of cursor samples taken on every poll tick. The clipboard
// changes somewhere between two ticks; by the time it is noticed the cursor
// may already have moved on, so the sample from the tick BEFORE the detecting
// one is the best estimate of where the copy was made.
function createCursorTrail() {
  let samples = [];
  return {
    push(sample) {
      samples.push(sample);
      const cutoff = sample.t - TRAIL_MAX_AGE_MS;
      samples = samples.filter((s) => s.t >= cutoff).slice(-TRAIL_MAX_LEN);
    },
    pick(detectedAt) { return pickCopySample(samples, detectedAt); },
    size() { return samples.length; },
    clear() { samples = []; }
  };
}

// samples: [{ x, y, t, ...extra }] oldest first. detectedAt: timestamp of the
// tick that noticed the change (its own sample is the last element, normally).
// Returns the newest sample strictly older than detectedAt, else the newest.
function pickCopySample(samples, detectedAt) {
  if (!samples || !samples.length) return null;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t < detectedAt) return samples[i];
  }
  return samples[samples.length - 1];
}

function rectContains(r, p, margin = 0) {
  return p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y - margin && p.y <= r.y + r.height + margin;
}

function fitsInside(r, wa) {
  return r.x >= wa.x && r.y >= wa.y && r.x + r.width <= wa.x + wa.width && r.y + r.height <= wa.y + wa.height;
}

function clampPoint(p, wa) {
  return {
    x: Math.min(Math.max(p.x, wa.x), wa.x + Math.max(0, wa.width - 1)),
    y: Math.min(Math.max(p.y, wa.y), wa.y + Math.max(0, wa.height - 1))
  };
}

// The OS can hand back a window 1-2px larger than asked (fractional DPI scales
// such as 125%). Given the ACTUAL bounds, returns the position that keeps the
// whole window inside the work area, or null when it already is.
function nudgeInside(actual, wa) {
  const x = Math.min(Math.max(actual.x, wa.x), Math.max(wa.x, wa.x + wa.width - actual.width));
  const y = Math.min(Math.max(actual.y, wa.y), Math.max(wa.y, wa.y + wa.height - actual.height));
  return x === actual.x && y === actual.y ? null : { x, y };
}

function clampRect(r, wa) {
  const x = Math.min(Math.max(r.x, wa.x), Math.max(wa.x, wa.x + wa.width - r.width));
  const y = Math.min(Math.max(r.y, wa.y), Math.max(wa.y, wa.y + wa.height - r.height));
  return { x, y, width: r.width, height: r.height };
}

// Places a width x height popup next to `point` (the cursor / copy location):
// below-right of it for LTR UI, below-left for RTL, `gap` px away, flipping
// above and/or to the other side when there is no room, always fully inside
// `workArea` (the work area of the display containing the point) and never
// covering the point itself. Returns { x, y }.
function computeAnchoredPopupPosition({ point: rawPoint, width, height, workArea, rtl = false, gap = 14 }) {
  const wa = workArea || { x: 0, y: 0, width: 0, height: 0 };
  // A cursor over the taskbar (or any strip outside the work area) is treated
  // as sitting on the nearest work-area edge, so the popup still opens next to it.
  const point = clampPoint(rawPoint, wa);
  const right = (rtl ? point.x - gap - width : point.x + gap);
  const left = (rtl ? point.x + gap : point.x - gap - width);
  const below = point.y + gap;
  const above = point.y - gap - height;
  const candidates = [
    { x: right, y: below }, { x: right, y: above },
    { x: left, y: below }, { x: left, y: above }
  ].map((c) => ({ ...c, width, height }));

  for (const c of candidates) {
    if (fitsInside(c, wa) && !rectContains(c, point, 2)) return { x: c.x, y: c.y };
  }
  // No candidate fits (small work area): take the preferred one clamped inside,
  // then, if that now sits on the cursor, try to slide it clear horizontally
  // and then vertically.
  const tries = [
    clampRect(candidates[0], wa),
    clampRect({ ...candidates[0], x: point.x + gap }, wa),
    clampRect({ ...candidates[0], x: point.x - gap - width }, wa),
    clampRect({ ...candidates[0], y: point.y + gap }, wa),
    clampRect({ ...candidates[0], y: point.y - gap - height }, wa)
  ];
  for (const r of tries) if (!rectContains(r, point, 2)) return { x: r.x, y: r.y };
  return { x: tries[0].x, y: tries[0].y };
}

// Window resized after content measurement (popup:fit): recompute against the
// same anchor so it stays adjacent to what was copied instead of drifting.
function computeFitBounds({ point, width, newHeight, workArea, rtl = false, gap = 14, minHeight = 120 }) {
  const height = Math.max(minHeight, Math.min(Math.round(newHeight), Math.max(minHeight, workArea.height - 16)));
  const { x, y } = computeAnchoredPopupPosition({ point, width, height, workArea, rtl, gap });
  return { x, y, width, height };
}

// Windows can apply a window's DIP bounds using the scale factor of the display
// it is currently on, which drifts the result on mixed-DPI setups. Returns the
// bounds to re-apply when the actual bounds differ from the intended ones.
function boundsCorrection(intended, actual, tolerance = 1) {
  const diff = ['x', 'y', 'width', 'height'].some((k) => Math.abs(intended[k] - actual[k]) > tolerance);
  return diff ? intended : null;
}

module.exports = {
  createCursorTrail, pickCopySample, computeAnchoredPopupPosition, computeFitBounds,
  boundsCorrection, nudgeInside, clampPoint, rectContains, fitsInside
};
