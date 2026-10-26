import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { createPostgresStore } from '../server/store.mjs'
import { createAuthApp } from '../server/auth.mjs'
import { createVercelHandler } from '../api/[...path].mjs'

async function serve(t, handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const origin = `http://127.0.0.1:${server.address().port}`
  return async (path, data, cookie) => {
    const response = await fetch(`${origin}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin }), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
}

test('Vercel function serves the anonymous session and reports a missing database without trying local disk', async t => {
  const request = await serve(t, createVercelHandler({ databaseUrl: '' }))
  const session = await request('/session')
  assert.equal(session.response.status, 200)
  assert.deepEqual(session.body, { user: null, school: null })
  const health = await request('/health')
  assert.equal(health.response.status, 503)
  assert.equal(health.body.code, 'DATABASE_NOT_CONFIGURED')
  const signup = await request('/auth/register', { name: 'Taylor Rivers', email: 'taylor@northbridge.edu', password: 'A long test passphrase 42!' })
  assert.equal(signup.response.status, 503)
  assert.equal(signup.body.code, 'DATABASE_NOT_CONFIGURED')
})

test('hosted signup, school setup, login, durable sessions and rate limits execute on a real PostgreSQL engine', async t => {
  const pg = new PGlite()
  const driver = { query: async (sql, parameters) => (await pg.query(sql, parameters)).rows, initialize: async schema => { await pg.exec(schema.join(';')) } }
  const firstStore = createPostgresStore('', driver)
  const request = await serve(t, createVercelHandler({ store: firstStore }))
  const credentials = { name: 'Taylor Rivers', email: 'taylor@northbridge.edu', password: 'A long test passphrase 42!' }
  const registered = await request('/auth/register', credentials)
  assert.equal(registered.response.status, 201)
  assert.match(registered.response.headers.get('set-cookie'), /Secure/)
  const school = await request('/school', { name: 'Northbridge University', domain: 'northbridge.edu', email: credentials.email, role: 'Treasurer', workspaceName: 'Student Council', budget: 75000.25, sampleData: false }, registered.cookie)
  assert.equal(school.response.status, 201)
  assert.equal(school.body.school.workspaceName, 'Student Council')
  assert.equal(school.body.school.budget, 75000.25)
  assert.equal(school.body.school.sampleData, false)

  // A separate function/store instance must read the same persistent account
  // and session rather than depending on a warm process or a local file.
  const secondStore = createPostgresStore('', driver)
  const secondService = createAuthApp({ store: secondStore, hosted: true })
  const secondRequest = await serve(t, secondService.app)
  const resumed = await secondRequest('/session', undefined, registered.cookie)
  assert.equal(resumed.body.user.id, registered.body.user.id)
  assert.equal(resumed.body.school.workspaceName, 'Student Council')
  const wrong = await secondRequest('/auth/login', { ...credentials, password: 'incorrect password' })
  assert.equal(wrong.response.status, 401)
  const login = await secondRequest('/auth/login', credentials, registered.cookie)
  assert.equal(login.response.status, 200)
  assert.equal(login.body.school.budget, 75000.25)
  assert.equal((await request('/session', undefined, registered.cookie)).body.user, null)
  await secondRequest('/auth/logout', {}, login.cookie)
  assert.equal((await request('/session', undefined, login.cookie)).body.user, null)
  const rateKeys = (await pg.query('SELECT key, hits FROM rate_limits')).rows
  assert.ok(rateKeys.some(row => row.key.startsWith('auth:') && row.hits >= 3))
  // Expiration and rate limit timestamps exceed PostgreSQL's 32-bit integer range.
  assert.ok((await pg.query('SELECT reset_at FROM rate_limits LIMIT 1')).rows[0].reset_at > 2147483647)
  await pg.close()
})
