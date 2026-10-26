import { DatabaseSync } from 'node:sqlite'
import { neon } from '@neondatabase/serverless'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { databaseError, classifyDatabaseFailure } from './database-config.mjs'

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)',
  `CREATE TABLE IF NOT EXISTS schools (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, domain TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
    workspace_name TEXT NOT NULL, budget NUMERIC(14, 2) NOT NULL, sample_data INTEGER NOT NULL
  )`,
  'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at BIGINT NOT NULL)',
]

export function createSQLiteStore(databasePath) {
  if (databasePath !== ':memory:') {
    const location = resolve(databasePath)
    if (['public', 'dist'].some(directory => location.startsWith(`${resolve(directory)}${sep}`))) throw new Error('Account databases must be outside public and build output directories.')
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
  }
  const db = new DatabaseSync(databasePath)
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(schema.join(';'))
  return { prepare: query => db.prepare(query), ready: async () => {}, close: () => db.close() }
}

// The injectable driver lets the same queries run against a real PostgreSQL
// engine in integration tests. Production uses Neon's verified HTTPS driver.
export function createPostgresStore(connectionString, driver) {
  if (!driver) {
    try {
      const parsed = new URL(connectionString)
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || parsed.pathname.length < 2) throw new Error()
    } catch { throw databaseError('DATABASE_URL_INVALID') }
  }
  let sql
  try { sql = driver ? null : neon(connectionString) }
  catch { throw databaseError('DATABASE_URL_INVALID') }
  const execute = driver ? driver.query : (query, parameters) => sql.query(query, parameters)
  let initialization
  const ready = () => {
    if (!initialization) {
      initialization = (async () => {
        if (driver) await driver.initialize(schema)
        else await sql.transaction([
          // Serialize schema creation across simultaneous serverless cold starts.
          sql.query('SELECT pg_advisory_xact_lock(874222516)'),
          ...schema.map(query => sql.query(query)),
        ])
      })().catch(error => { initialization = undefined; throw classifyDatabaseFailure(error) })
    }
    return initialization
  }
  const query = async (statement, parameters) => {
    await ready()
    let position = 0
    try { return await execute(statement.replace(/\?/g, () => `$${++position}`), parameters) }
    catch (error) { throw classifyDatabaseFailure(error) }
  }
  return {
    ready,
    prepare: statement => ({
      get: async (...parameters) => (await query(statement, parameters))[0],
      run: async (...parameters) => { await query(statement, parameters) },
    }),
    close: () => driver?.close?.(),
  }
}

export function missingDatabaseStore() {
  const unavailable = () => { throw databaseError('DATABASE_NOT_CONFIGURED') }
  return { ready: async () => unavailable(), prepare: () => ({ get: unavailable, run: unavailable }), close() {} }
}

// Rate limits must survive serverless cold starts and multiple function instances.
export class DatabaseRateLimitStore {
  localKeys = false
  constructor(db, prefix) { this.db = db; this.prefix = prefix }
  init(options) { this.windowMs = options.windowMs }
  async increment(key) {
    const now = Date.now(), reset = now + this.windowMs
    const row = await this.db.prepare(`INSERT INTO rate_limits (key, hits, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
      hits = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.hits + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`).get(`${this.prefix}${key}`, reset, now, now, reset)
    return { totalHits: Number(row.hits), resetTime: new Date(Number(row.reset_at)) }
  }
  async decrement(key) { await this.db.prepare('UPDATE rate_limits SET hits = CASE WHEN hits > 0 THEN hits - 1 ELSE 0 END WHERE key = ?').run(`${this.prefix}${key}`) }
  async resetKey(key) { await this.db.prepare('DELETE FROM rate_limits WHERE key = ?').run(`${this.prefix}${key}`) }
}
