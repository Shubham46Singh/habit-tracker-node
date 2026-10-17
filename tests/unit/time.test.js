const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidTimezone, todayIn, secondsUntilLocalMidnight, isValidDayKey,
} = require('../../src/time');
const { currentStreak } = require('../../src/streaks');

describe('todayIn', () => {
  test('same instant, different calendar day by timezone', () => {
    const instant = new Date('2026-10-12T20:00:00Z');
    assert.equal(todayIn('UTC', instant), '2026-10-12');
    assert.equal(todayIn('Asia/Kolkata', instant), '2026-10-13'); // 01:30 IST
  });
  test('behind UTC: still yesterday locally', () => {
    const instant = new Date('2026-10-13T05:00:00Z');
    assert.equal(todayIn('UTC', instant), '2026-10-13');
    assert.equal(todayIn('America/Los_Angeles', instant), '2026-10-12'); // 22:00 PDT
  });
  test('month and year rollover', () => {
    assert.equal(todayIn('Asia/Kolkata', new Date('2026-12-31T19:00:00Z')), '2027-01-01');
  });
});

describe('secondsUntilLocalMidnight', () => {
  test('mid-day UTC', () => {
    assert.equal(secondsUntilLocalMidnight('UTC', new Date('2026-10-13T12:00:00Z')), 43200);
  });
  test('uses the local clock, not UTC', () => {
    // 01:30:00 in Kolkata -> 22.5 hours left
    assert.equal(secondsUntilLocalMidnight('Asia/Kolkata', new Date('2026-10-12T20:00:00Z')), 81000);
  });
  test('never less than 60 seconds', () => {
    assert.equal(secondsUntilLocalMidnight('UTC', new Date('2026-10-13T23:59:50Z')), 60);
  });
});

describe('validation', () => {
  test('isValidTimezone', () => {
    assert.equal(isValidTimezone('Asia/Kolkata'), true);
    assert.equal(isValidTimezone('UTC'), true);
    assert.equal(isValidTimezone('Mars/Base'), false);
    assert.equal(isValidTimezone(''), false);
    assert.equal(isValidTimezone(undefined), false);
  });
  test('isValidDayKey', () => {
    assert.equal(isValidDayKey('2026-10-13'), true);
    assert.equal(isValidDayKey('2028-02-29'), true);
    assert.equal(isValidDayKey('2026-02-30'), false);
    assert.equal(isValidDayKey('13-10-2026'), false);
    assert.equal(isValidDayKey(20261013), false);
  });
});

describe('the bug the timezone design prevents', () => {
  // A Los Angeles user ticked on the 11th and 12th (local dates). At this
  // instant it is already the 14th in UTC but still the 13th in Los Angeles.
  const ticks = ['2026-10-11', '2026-10-12'];
  const instant = new Date('2026-10-14T03:00:00Z');

  test('UTC "today" wrongly breaks the streak', () => {
    assert.equal(currentStreak(ticks, todayIn('UTC', instant)).streak, 0);
  });
  test("the habit's own timezone keeps it alive", () => {
    assert.equal(currentStreak(ticks, todayIn('America/Los_Angeles', instant)).streak, 2);
  });
});
