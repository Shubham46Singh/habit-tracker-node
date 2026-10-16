const { Pool, types } = require('pg');

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns them
// into JS Dates at *local server midnight*, which silently shifts the day
// whenever the server timezone is not UTC.
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
