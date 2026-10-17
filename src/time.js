/**
 * Timezone helpers. "Today" is always computed for a specific IANA timezone,
 * never from the server's clock zone. All functions take `now` so they are
 * deterministic in tests.
 */

function parts(tz, now) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out = {};
  for (const p of f.formatToParts(now)) out[p.type] = p.value;
  return out;
}

/** True if tz is a valid IANA timezone name such as 'Asia/Kolkata'. */
function isValidTimezone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date ('YYYY-MM-DD') it is right now in timezone tz. */
function todayIn(tz, now = new Date()) {
  const p = parts(tz, now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Seconds until local midnight in tz (minimum 60) - how long a streak figure stays valid. */
function secondsUntilLocalMidnight(tz, now = new Date()) {
  const p = parts(tz, now);
  const elapsed = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return Math.max(60, 86400 - elapsed);
}

/** Is this a real calendar date written as 'YYYY-MM-DD'? */
function isValidDayKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

module.exports = { isValidTimezone, todayIn, secondsUntilLocalMidnight, isValidDayKey };
