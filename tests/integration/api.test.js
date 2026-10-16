/**
 * Integration tests: a real Postgres and Redis, with migrations already applied.
 * Needs DATABASE_URL and REDIS_URL.
 */
const {
  test, describe, before, after,
} = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/server');
const db = require('../../src/db');
const cache = require('../../src/cache');
const { todayIn } = require('../../src/time');

let server;
let base;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => { server.close(resolve); });
  await cache.close();
  await db.pool.end();
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const findHabit = async (id) => {
  const { body } = await call('GET', '/habits');
  return body.habits.find((h) => h.id === id);
};

describe('health', () => {
  test('reports postgres and redis', async () => {
    const { status, body } = await call('GET', '/health');
    assert.equal(status, 200);
    assert.deepEqual(body, { status: 'ok', postgres: true, redis: true });
  });
});

describe('habits', () => {
  test('sample data from the seed migration is present', async () => {
    const { status, body } = await call('GET', '/habits');
    assert.equal(status, 200);
    const names = body.habits.map((h) => h.name);
    assert.ok(names.includes('Read 20 pages'));
    assert.ok(names.includes('Gym'));
  });

  test('POST /habits creates a habit', async () => {
    const { status, body } = await call('POST', '/habits', {
      name: 'Meditate', schedule: [1, 3, 5], timezone: 'Asia/Kolkata',
    });
    assert.equal(status, 201);
    assert.equal(body.name, 'Meditate');
    assert.deepEqual(body.schedule, [1, 3, 5]);
    assert.equal(body.timezone, 'Asia/Kolkata');
  });

  test('POST /habits validates input', async () => {
    assert.equal((await call('POST', '/habits', {})).status, 400);
    assert.equal((await call('POST', '/habits', { name: 'x', schedule: [9] })).status, 400);
    assert.equal((await call('POST', '/habits', { name: 'x', timezone: 'Mars/Base' })).status, 400);
  });
});

describe('ticks and streaks', () => {
  test('tick, read the streak, undo the tick', async () => {
    const { body: created } = await call('POST', '/habits', { name: 'Stretch' });
    const id = created.id;

    const tick = await call('POST', `/habits/${id}/tick`);
    assert.equal(tick.status, 201);
    assert.equal(tick.body.ticked, true);

    const after1 = await findHabit(id);
    assert.equal(after1.tickedToday, true);
    assert.equal(after1.streak, 1);

    const undo = await call('DELETE', `/habits/${id}/tick`);
    assert.equal(undo.status, 200);
    assert.equal(undo.body.removed, 1);

    const after2 = await findHabit(id);
    assert.equal(after2.tickedToday, false);
    assert.equal(after2.streak, 0);
  });

  test('ticking twice is idempotent', async () => {
    const { body: created } = await call('POST', '/habits', { name: 'Journal' });
    await call('POST', `/habits/${created.id}/tick`);
    await call('POST', `/habits/${created.id}/tick`);
    assert.equal((await findHabit(created.id)).totalTicks, 1);
  });

  test('a second read is served from the Redis cache', async () => {
    const { body: created } = await call('POST', '/habits', { name: 'Walk' });
    await findHabit(created.id);
    assert.equal((await findHabit(created.id)).cached, true);
  });

  test("ticks use the habit's own timezone for today", async () => {
    const tz = 'Pacific/Kiritimati'; // UTC+14, the furthest ahead of UTC
    const { body: created } = await call('POST', '/habits', { name: 'Early bird', timezone: tz });
    const { body: tick } = await call('POST', `/habits/${created.id}/tick`);
    assert.equal(tick.day, todayIn(tz));
  });

  test('future days are rejected', async () => {
    const { body: created } = await call('POST', '/habits', { name: 'Future' });
    const res = await call('POST', `/habits/${created.id}/tick`, { day: '2999-01-01' });
    assert.equal(res.status, 400);
  });

  test('backfilling a past day builds a streak', async () => {
    const { body: created } = await call('POST', '/habits', { name: 'Backfill' });
    const today = todayIn('UTC');
    const y = new Date(`${today}T00:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    await call('POST', `/habits/${created.id}/tick`, { day: y.toISOString().slice(0, 10) });
    await call('POST', `/habits/${created.id}/tick`);
    assert.equal((await findHabit(created.id)).streak, 2);
  });

  test('unknown habit is a 404 and a bad id is a 400', async () => {
    assert.equal((await call('POST', '/habits/999999/tick')).status, 404);
    assert.equal((await call('POST', '/habits/abc/tick')).status, 400);
  });
});
