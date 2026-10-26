import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

const scrypt = promisify(scryptCallback)
const cookieName = 'equivenn_session'
const sessionLifetime = 7 * 24 * 60 * 60 * 1000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const roles = ['Treasurer', 'Council member', 'Organization lead', 'Administrator']
const digest = value => createHash('sha256').update(value).digest('hex')
const clean = value => typeof value === 'string' ? value.trim() : ''

export function createAuthApp({ databasePath = process.env.AUTH_DB_PATH || resolve('.data/equivenn.sqlite'), secureCookies = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' } = {}) {
  if (databasePath !== ':memory:') {
    const location = resolve(databasePath)
    if (['public', 'dist'].some(directory => location.startsWith(`${resolve(directory)}${sep}`))) throw new Error('Account databases must be outside public and build output directories.')
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
  }
  const db = new DatabaseSync(databasePath)
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS schools (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, domain TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
      workspace_name TEXT NOT NULL, budget REAL NOT NULL, sample_data INTEGER NOT NULL
    );
  `)
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
    next()
  })
  // The UI and API share an origin in development and production. Reject
  // cross-origin mutations before parsing their bodies (no permissive CORS).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    try {
      if (new URL(req.get('origin') || '').host !== req.get('host')) return res.status(403).json({ error: 'This request must come from your Equivenn workspace.' })
    } catch { return res.status(403).json({ error: 'This request must come from your Equivenn workspace.' }) }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Please send a JSON request.' })
    next()
  })
  app.use('/api', express.json({ limit: '8kb' }))
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 35, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many account attempts. Please try again in 15 minutes.' } })
  const schoolLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } })
  const session = req => {
    const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
    return db.prepare('SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(digest(token), Date.now()) ?? null
  }
  const school = userId => {
    const row = db.prepare('SELECT name, domain, email, role, workspace_name AS workspaceName, budget, sample_data AS sampleData FROM schools WHERE user_id = ?').get(userId)
    return row ? { ...row, sampleData: Boolean(row.sampleData), verified: false } : null
  }
  const result = user => ({ user, school: user ? school(user.id) : null })
  const issueSession = (res, userId) => {
    const token = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(digest(token), userId, Date.now() + sessionLifetime)
    res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: sessionLifetime, path: '/' })
  }
  const requireUser = (req, res, next) => {
    req.account = session(req)
    if (!req.account) return res.status(401).json({ error: 'Please sign in to continue.' })
    next()
  }
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/session', (req, res) => res.json(result(session(req))))
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const name = clean(req.body?.name), email = clean(req.body?.email).toLowerCase(), password = req.body?.password
    if (name.length < 2 || name.length > 80 || email.length > 254 || !emailPattern.test(email) || typeof password !== 'string' || password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Enter your full name, a valid email, and a password with 10–128 characters.' })
    }
    const salt = randomBytes(16).toString('hex')
    const hash = (await scrypt(password, salt, 64)).toString('hex')
    const user = { id: randomUUID(), name, email }
    try {
      db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, name, email, `${salt}:${hash}`, Date.now())
    } catch (error) {
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' })
      throw error
    }
    issueSession(res, user.id)
    res.status(201).json(result(user))
  })
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = clean(req.body?.email).toLowerCase(), password = req.body?.password
    if (!emailPattern.test(email) || email.length > 254 || typeof password !== 'string' || password.length > 128 || !password) return res.status(400).json({ error: 'Enter a valid email and password.' })
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    // Perform the expensive hash for unknown accounts too.
    const [salt, expected] = user ? user.password_hash.split(':') : [randomBytes(16).toString('hex'), '0'.repeat(128)]
    const actual = await scrypt(password, salt, 64)
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), actual) || !user) return res.status(401).json({ error: 'The email or password does not match. Please try again.' })
    // Rotate this browser's previous session rather than retaining it.
    const previous = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(previous))
    issueSession(res, user.id)
    res.json(result({ id: user.id, name: user.name, email: user.email }))
  })
  app.post('/api/auth/logout', (req, res) => {
    const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token))
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' })
    res.json({ ok: true })
  })
  app.post('/api/school', schoolLimiter, requireUser, (req, res) => {
    const name = clean(req.body?.name), domain = clean(req.body?.domain).toLowerCase(), email = clean(req.body?.email).toLowerCase()
    const role = clean(req.body?.role), workspaceName = clean(req.body?.workspaceName), budget = req.body?.budget, sampleData = req.body?.sampleData
    const emailDomain = email.split('@')[1]
    if (name.length < 3 || name.length > 120 || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || !emailPattern.test(email) || email.length > 254 || !(emailDomain === domain || emailDomain?.endsWith(`.${domain}`)) || !roles.includes(role) || workspaceName.length < 3 || workspaceName.length > 80 || typeof budget !== 'number' || !Number.isFinite(budget) || budget < 1 || budget > 100000000 || typeof sampleData !== 'boolean') {
      return res.status(400).json({ error: 'Check your school details. Your school email must match the school domain, and your budget must be between $1 and $100,000,000.' })
    }
    if (school(req.account.id)) return res.json(result(req.account))
    db.prepare('INSERT INTO schools (user_id, name, domain, email, role, workspace_name, budget, sample_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(req.account.id, name, domain, email, role, workspaceName, Math.round(budget * 100) / 100, sampleData ? 1 : 0)
    res.status(201).json(result(req.account))
  })
  app.use('/api', (_req, res) => res.status(404).json({ error: 'This endpoint does not exist.' }))
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    const invalidBody = error.type === 'entity.parse.failed' || error.type === 'entity.too.large'
    res.status(invalidBody ? (error.status || 400) : 500).json({ error: invalidBody ? 'Please check your request and try again.' : 'Something went wrong. Please try again.' })
  })
  return { app, close: () => db.close() }
}
