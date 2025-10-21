import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL env var is required');
}

const sslOptions = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool({
  connectionString,
  ssl: sslOptions,
});

export function query(text, params) {
  return pool.query(text, params);
}
