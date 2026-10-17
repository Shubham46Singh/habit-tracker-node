const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  toKey, fromKey, weekday, isScheduled, previousDay, currentStreak, longestStreak,
} = require('../../src/streaks');

// 2026-10-13 is a Tuesday.
describe('date helpers', () => {
  test('toKey and fromKey round-trip', () => {
    assert.equal(toKey(fromKey('2026-10-13')), '2026-10-13');
  });
  test('weekday: 0 is Sunday', () => {
    assert.equal(weekday('2026-10-13'), 2);
    assert.equal(weekday('2026-10-11'), 0);
  });
  test('previousDay crosses month, year and leap-day boundaries', () => {
    assert.equal(previousDay('2026-03-01'), '2026-02-28');
    assert.equal(previousDay('2027-01-01'), '2026-12-31');
    assert.equal(previousDay('2028-03-01'), '2028-02-29');
  });
  test('isScheduled: empty or missing schedule means every day', () => {
    assert.equal(isScheduled('2026-10-13', []), true);
    assert.equal(isScheduled('2026-10-13', undefined), true);
  });
  test('isScheduled respects weekdays', () => {
    assert.equal(isScheduled('2026-10-12', [1, 3, 5]), true); // Monday
    assert.equal(isScheduled('2026-10-13', [1, 3, 5]), false); // Tuesday
  });
});

describe('currentStreak', () => {
  test('empty history is zero', () => {
    assert.deepEqual(currentStreak([], '2026-10-13'), { streak: 0, freezesUsed: 0 });
  });
  test('consecutive run including today', () => {
    const r = currentStreak(['2026-10-11', '2026-10-12', '2026-10-13'], '2026-10-13');
    assert.equal(r.streak, 3);
  });
  test('today not ticked yet does not break the streak', () => {
    const r = currentStreak(['2026-10-11', '2026-10-12'], '2026-10-13');
    assert.equal(r.streak, 2);
  });
  test('a missed day breaks the streak', () => {
    const r = currentStreak(['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13'], '2026-10-13');
    assert.equal(r.streak, 2);
  });
  test('two missed days (today and yesterday) means zero', () => {
    assert.equal(currentStreak(['2026-10-10'], '2026-10-13').streak, 0);
  });
  test('order and duplicates in the input do not matter', () => {
    const r = currentStreak(['2026-10-13', '2026-10-12', '2026-10-12'], '2026-10-13');
    assert.equal(r.streak, 2);
  });
  test('days outside the schedule are skipped, not counted as misses', () => {
    // Wed 14, Mon 12, Fri 9 are due; Tue/Sun/Sat/Thu are not.
    const r = currentStreak(['2026-10-09', '2026-10-12', '2026-10-14'], '2026-10-14', { schedule: [1, 3, 5] });
    assert.equal(r.streak, 3);
  });
  test('a missed scheduled day still breaks a scheduled habit', () => {
    const r = currentStreak(['2026-10-09', '2026-10-14'], '2026-10-14', { schedule: [1, 3, 5] });
    assert.equal(r.streak, 1);
  });
  test('unticked non-scheduled today is fine', () => {
    // Tuesday is not due; Monday was ticked.
    const r = currentStreak(['2026-10-12'], '2026-10-13', { schedule: [1] });
    assert.equal(r.streak, 1);
  });
  test('a freeze covers one missed day', () => {
    const r = currentStreak(['2026-10-11', '2026-10-13'], '2026-10-13', { freezes: 1 });
    assert.deepEqual(r, { streak: 2, freezesUsed: 1 });
  });
  test('without a freeze the same history breaks', () => {
    assert.equal(currentStreak(['2026-10-11', '2026-10-13'], '2026-10-13').streak, 1);
  });
});

describe('longestStreak', () => {
  test('empty history is zero', () => {
    assert.equal(longestStreak([]), 0);
  });
  test('a single tick is one', () => {
    assert.equal(longestStreak(['2026-10-01']), 1);
  });
  test('finds the longest of several runs', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'];
    assert.equal(longestStreak(days), 3);
  });
  test('unordered input with duplicates', () => {
    assert.equal(longestStreak(['2026-10-03', '2026-10-01', '2026-10-02', '2026-10-02']), 3);
  });
  test('respects the schedule when joining runs', () => {
    // Mon 5, Wed 7, Fri 9, Mon 12 are consecutive due days; Fri 16 skips Wed 14.
    const days = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-16'];
    assert.equal(longestStreak(days, { schedule: [1, 3, 5] }), 4);
  });
});

describe('timezone: the day a streak is counted from', () => {
  test('streak figures depend only on the "today" string passed in', () => {
    const days = ['2026-10-11', '2026-10-12'];
    assert.equal(currentStreak(days, '2026-10-13').streak, 2); // still time to tick the 13th
    assert.equal(currentStreak(days, '2026-10-14').streak, 0); // 13th fully missed
  });
});
