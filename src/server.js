const express = require('express');
const db = require('./db');
const cache = require('./cache');
const { currentStreak, longestStreak } = require('./streaks');
const {
  isValidTimezone, todayIn, secondsUntilLocalMidnight, isValidDayKey,
} = require('./time');

const app = express();
app.use(express.json());

// Express 4 does not catch rejected promises in async handlers; this does.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function getHabit(id) {
  const { rows } = await db.query(
    'SELECT id, name, schedule, freezes, timezone FROM habits WHERE id = $1', [id],
  );
  return rows[0];
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'invalid habit id' });
    return null;
  }
  return id;
}

app.get('/health', async (req, res) => {
  const out = { status: 'ok', postgres: false, redis: false };
  try { await db.query('SELECT 1'); out.postgres = true; } catch (e) { out.pgError = e.message; }
  try { const c = await cache.getClient(); await c.ping(); out.redis = true; } catch (e) { out.redisError = e.message; }
  res.status(out.postgres && out.redis ? 200 : 503).json(out);
});

app.get('/', (req, res) => res.json({
  service: 'habit-tracker',
  endpoints: [
    'GET /health', 'GET /habits', 'POST /habits',
    'POST /habits/:id/tick', 'DELETE /habits/:id/tick',
  ],
}));

app.get('/habits', wrap(async (req, res) => {
  const { rows: habits } = await db.query(
    'SELECT id, name, schedule, freezes, timezone FROM habits ORDER BY id',
  );
  const out = [];
  for (const h of habits) {
    // "today" belongs to the habit's timezone, not the server's
    const today = todayIn(h.timezone);
    let stats = await cache.getStreak(h.id);
    if (stats && stats.today !== today) stats = null; // cached on a previous local day
    let cached = true;
    if (!stats) {
      cached = false;
      const { rows } = await db.query(
        'SELECT day FROM ticks WHERE habit_id = $1 ORDER BY day', [h.id],
      );
      const days = rows.map((r) => r.day);
      const cur = currentStreak(days, today, { schedule: h.schedule, freezes: h.freezes });
      stats = {
        today,
        streak: cur.streak,
        freezesUsed: cur.freezesUsed,
        longest: longestStreak(days, { schedule: h.schedule }),
        tickedToday: days.includes(today),
        totalTicks: days.length,
      };
      await cache.setStreak(h.id, stats, secondsUntilLocalMidnight(h.timezone));
    }
    out.push({ ...h, ...stats, cached });
  }
  res.json({ habits: out });
}));

app.post('/habits', wrap(async (req, res) => {
  const {
    name, schedule = [], freezes = 2, timezone = 'UTC',
  } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Array.isArray(schedule) || !schedule.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return res.status(400).json({ error: 'schedule must be an array of weekday numbers 0-6' });
  }
  if (!Number.isInteger(freezes) || freezes < 0 || freezes > 10) {
    return res.status(400).json({ error: 'freezes must be an integer 0-10' });
  }
  if (!isValidTimezone(timezone)) {
    return res.status(400).json({ error: 'timezone must be an IANA name such as Asia/Kolkata' });
  }
  const { rows } = await db.query(
    `INSERT INTO habits (name, schedule, freezes, timezone) VALUES ($1, $2, $3, $4)
     RETURNING id, name, schedule, freezes, timezone`,
    [String(name).trim(), [...new Set(schedule)].sort(), freezes, timezone],
  );
  res.status(201).json(rows[0]);
}));

app.post('/habits/:id/tick', wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const habit = await getHabit(id);
  if (!habit) return res.status(404).json({ error: 'no such habit' });

  const today = todayIn(habit.timezone);
  const day = req.body?.day ?? today;
  if (!isValidDayKey(day)) return res.status(400).json({ error: 'day must be YYYY-MM-DD' });
  if (day > today) return res.status(400).json({ error: 'cannot tick a day in the future' });

  await db.query(
    'INSERT INTO ticks (habit_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [id, day],
  );
  await cache.invalidate(id);
  return res.status(201).json({ habitId: id, day, ticked: true });
}));

app.delete('/habits/:id/tick', wrap(async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const habit = await getHabit(id);
  if (!habit) return res.status(404).json({ error: 'no such habit' });

  const day = req.query.day ?? todayIn(habit.timezone);
  if (!isValidDayKey(day)) return res.status(400).json({ error: 'day must be YYYY-MM-DD' });

  const { rowCount } = await db.query(
    'DELETE FROM ticks WHERE habit_id = $1 AND day = $2', [id, day],
  );
  await cache.invalidate(id);
  return res.json({ habitId: id, day, removed: rowCount });
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
});

if (require.main === module) {
  const port = process.env.PORT || 8080;
  // 0.0.0.0 so the container is reachable from outside
  app.listen(port, '0.0.0.0', () => console.log(`listening on ${port}`));
}

module.exports = app;
