// Safe execution and validation of user-written custom-rule regular expressions.
// A pattern like (a+)+$ backtracks exponentially (28 chars = ~4 s) and a try/catch cannot
// interrupt it, so (1) patterns are validated when saved, (2) the tested text is capped and
// (3) every match runs in a vm context with a hard time budget - the main thread can never
// be blocked for longer than the budget, whatever the pattern.

const vm = require('vm');

const MAX_PATTERN_LENGTH = 200;
const MAX_TEXT_LENGTH = 500; // custom rules only look at short copies
const MATCH_BUDGET_MS = 40;
const VALIDATE_BUDGET_MS = 60;

// Patterns that already blew the time budget at run time: skipped from then on (until restart)
// so one bad rule costs at most one budget, not one per copy.
const slowPatterns = new Set();

// Returns the matched array (with .index) or null. Never throws, never blocks longer than the budget.
function safeMatch(pattern, text, budgetMs = MATCH_BUDGET_MS) {
  if (typeof pattern !== 'string' || typeof text !== 'string') return null;
  if (slowPatterns.has(pattern)) return null;
  const input = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  try {
    const sandbox = { p: pattern, t: input, r: null };
    vm.runInNewContext(
      'var m = new RegExp(p).exec(t); r = m ? Array.prototype.slice.call(m) : null;',
      sandbox,
      { timeout: budgetMs }
    );
    return sandbox.r ? sandbox.r.map((x) => (x === undefined ? undefined : String(x))) : null;
  } catch (err) {
    if (err && (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || /timed out/i.test(String(err.message)))) {
      slowPatterns.add(pattern);
    }
    return null;
  }
}

// Static check for the classic catastrophic shape: a group that contains an unbounded
// quantifier and is itself repeated without a tight bound - (a+)+, (.*)*, (\d+\s?)*, (a|b+)+ ...
function hasNestedQuantifier(pattern) {
  const stack = []; // each entry: does this group contain an unbounded quantifier?
  let inClass = false;
  const isUnbounded = (i) => {
    const c = pattern[i];
    if (c === '+' || c === '*') return true;
    if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (!m) return false;
      if (m[2] !== undefined && (m[3] === '' || Number(m[3]) >= 20)) return true;
      return false;
    }
    return false;
  };
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') { inClass = true; continue; }
    if (c === '(') { stack.push(false); continue; }
    if (c === ')') {
      const had = stack.pop();
      if (had && i + 1 < pattern.length && isUnbounded(i + 1)) return true;
      if (had && stack.length) stack[stack.length - 1] = true;
      continue;
    }
    if (isUnbounded(i) && stack.length) stack[stack.length - 1] = true;
  }
  return false;
}

// Adversarial inputs used as a dry run: a pattern that is slow on any of them is rejected.
const PROBES = [
  'a'.repeat(40) + '!',
  '1'.repeat(40) + 'x',
  ' '.repeat(40) + '!',
  'ab'.repeat(20) + '!',
  'x-'.repeat(20) + '!'
];

// -> { ok: true } or { ok: false, code } where code is one of
// 'empty' | 'too-long' | 'invalid' | 'nested' | 'slow'
function validatePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return { ok: false, code: 'empty' };
  if (pattern.length > MAX_PATTERN_LENGTH) return { ok: false, code: 'too-long' };
  try { new RegExp(pattern); } catch (err) { return { ok: false, code: 'invalid' }; }
  if (hasNestedQuantifier(pattern)) return { ok: false, code: 'nested' };
  for (const probe of PROBES) {
    try {
      vm.runInNewContext('new RegExp(p).exec(t)', { p: pattern, t: probe }, { timeout: VALIDATE_BUDGET_MS });
    } catch (err) {
      return { ok: false, code: 'slow' };
    }
  }
  return { ok: true };
}

module.exports = { MAX_PATTERN_LENGTH, MAX_TEXT_LENGTH, MATCH_BUDGET_MS, safeMatch, validatePattern, hasNestedQuantifier, slowPatterns };
