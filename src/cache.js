/**
 * Redis cache for streak figures. Cache failures never break the API:
 * reads return null and writes are skipped, so Postgres stays the source of truth.
 */
const { createClient } = require('redis');

let client = null;
let connecting = null;

async function getClient() {
  if (client && client.isOpen) return client;
  if (!connecting) {
    const c = createClient({
      url: process.env.REDIS_URL,
      // fail fast instead of retrying forever, so /health can report redis: false
      socket: { reconnectStrategy: false },
    });
    c.on('error', () => {});
    connecting = c.connect()
      .then(() => { client = c; return c; })
      .finally(() => { connecting = null; });
  }
  return connecting;
}

const key = (habitId) => `streak:${habitId}`;

async function getStreak(habitId) {
  try {
    const c = await getClient();
    const raw = await c.get(key(habitId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setStreak(habitId, stats, ttlSeconds) {
  try {
    const c = await getClient();
    await c.set(key(habitId), JSON.stringify(stats), { EX: ttlSeconds });
  } catch {
    /* cache is best-effort */
  }
}

async function invalidate(habitId) {
  try {
    const c = await getClient();
    await c.del(key(habitId));
  } catch {
    /* cache is best-effort */
  }
}

async function close() {
  if (client && client.isOpen) await client.quit();
  client = null;
}

module.exports = { getClient, getStreak, setStreak, invalidate, close };
