import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createAuthApp } from '../server/auth.mjs'

const credentials = { name: 'Jamie Lewis', email: 'jamie@northbridge.edu', password: 'A long test passphrase 42!' }
const school = { name: 'Northbridge University', domain: 'northbridge.edu', email: credentials.email, role: 'Treasurer', workspaceName: 'Student Council', budget: 75000, sampleData: false }

test('account databases cannot be placed in public or build output directories', () => {
  assert.throws(() => createAuthApp({ databasePath: join(process.cwd(), 'public', 'accounts.sqlite') }), /outside public/)
  assert.throws(() => createAuthApp({ databasePath: join(process.cwd(), 'dist', 'accounts.sqlite') }), /outside public/)
})

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'equivenn-auth-'))
  const databasePath = join(dir, 'auth.sqlite')
  const auth = createAuthApp({ databasePath, secureCookies: false })
  const server = auth.app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); auth.close(); rmSync(dir, { recursive: true, force: true }) })
  const request = async (path, { data, cookie, requestOrigin = origin } = {}) => {
    const response = await fetch(`${origin}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: requestOrigin }), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  return { request, databasePath }
}

test('registration hashes passwords, stores only hashed session tokens, and requires school setup', async t => {
  const { request, databasePath } = await fixture(t)
  const anonymous = await request('/session')
  assert.deepEqual(anonymous.body, { user: null, school: null })
  const registered = await request('/auth/register', { data: credentials })
  assert.equal(registered.response.status, 201)
  assert.equal(registered.body.user.name, credentials.name)
  assert.equal(registered.body.school, null)
  assert.equal('password_hash' in registered.body.user, false)
  assert.match(registered.response.headers.get('set-cookie'), /HttpOnly/i)
  assert.match(registered.response.headers.get('set-cookie'), /SameSite=Lax/i)
  assert.equal(registered.response.headers.get('cache-control'), 'no-store')
  const db = new DatabaseSync(databasePath)
  const stored = db.prepare('SELECT password_hash FROM users').get()
  assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/)
  assert.notEqual(stored.password_hash, credentials.password)
  const tokenHash = db.prepare('SELECT token_hash FROM sessions').get().token_hash
  assert.notEqual(tokenHash, registered.cookie.split('=')[1])
  db.close()
  const continued = await request('/session', { cookie: registered.cookie })
  assert.equal(continued.body.user.id, registered.body.user.id)
  assert.equal(continued.body.school, null)
})

test('school setup rejects anonymous users, mismatched school emails, and invalid budgets', async t => {
  const { request } = await fixture(t)
  assert.equal((await request('/school', { data: school })).response.status, 401)
  const { cookie } = await request('/auth/register', { data: credentials })
  for (const data of [{ ...school, email: 'person@another.edu' }, { ...school, budget: -1 }, { ...school, domain: 'https://northbridge.edu' }, { ...school, role: 'Superuser' }]) {
    assert.equal((await request('/school', { data, cookie })).response.status, 400)
  }
  const connected = await request('/school', { data: school, cookie })
  assert.equal(connected.response.status, 201)
  assert.equal(connected.body.school.name, school.name)
  assert.equal(connected.body.school.verified, false)
  assert.equal(connected.body.school.sampleData, false)
  assert.equal((await request('/session', { cookie })).body.school.budget, 75000)
})

test('login rejects incorrect passwords, rotates the session, and logout invalidates it', async t => {
  const { request } = await fixture(t)
  const registered = await request('/auth/register', { data: credentials })
  await request('/school', { data: school, cookie: registered.cookie })
  assert.equal((await request('/auth/login', { data: { email: credentials.email, password: 'incorrect' } })).response.status, 401)
  assert.equal((await request('/auth/login', { data: { email: 'missing@northbridge.edu', password: credentials.password } })).response.status, 401)
  const login = await request('/auth/login', { data: credentials, cookie: registered.cookie })
  assert.equal(login.response.status, 200)
  assert.equal(login.body.school.workspaceName, school.workspaceName)
  assert.notEqual(login.cookie, registered.cookie)
  assert.equal((await request('/session', { cookie: registered.cookie })).body.user, null)
  await request('/auth/logout', { data: {}, cookie: login.cookie })
  assert.equal((await request('/session', { cookie: login.cookie })).body.user, null)
})

test('account validation, duplicate email normalization, forged sessions, and cross-origin writes are rejected', async t => {
  const { request } = await fixture(t)
  assert.equal((await request('/auth/register', { data: { ...credentials, password: 'short' } })).response.status, 400)
  assert.equal((await request('/auth/register', { data: credentials, requestOrigin: 'https://unrelated.example' })).response.status, 403)
  assert.equal((await request('/auth/register', { data: credentials })).response.status, 201)
  assert.equal((await request('/auth/register', { data: { ...credentials, email: 'JAMIE@NORTHBRIDGE.EDU' } })).response.status, 409)
  assert.equal((await request('/session', { cookie: `equivenn_session=${'a'.repeat(64)}` })).body.user, null)
})

test('school connections are isolated by account and expired sessions cannot access them', async t => {
  const { request, databasePath } = await fixture(t)
  const first = await request('/auth/register', { data: credentials })
  await request('/school', { data: school, cookie: first.cookie })
  const second = await request('/auth/register', { data: { ...credentials, email: 'another@other.edu' } })
  assert.equal((await request('/session', { cookie: second.cookie })).body.school, null)
  assert.equal((await request('/session', { cookie: first.cookie })).body.school.name, school.name)
  const db = new DatabaseSync(databasePath)
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1)
  db.close()
  assert.equal((await request('/session', { cookie: first.cookie })).body.user, null)
  assert.equal((await request('/school', { cookie: first.cookie, data: school })).response.status, 401)
})

test('repeated authentication attempts are rate limited', async t => {
  const { request } = await fixture(t)
  for (let i = 0; i < 35; i++) assert.equal((await request('/auth/login', { data: {} })).response.status, 400)
  const limited = await request('/auth/login', { data: {} })
  assert.equal(limited.response.status, 429)
  assert.ok(limited.response.headers.has('retry-after'))
})
