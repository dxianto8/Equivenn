import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { createPostgresStore } from '../server/store.mjs'
import { createAuthApp } from '../server/auth.mjs'
import sharedHandler, { createVercelHandler } from '../server/vercel.mjs'

async function deployedEndpoints(options) {
  const handlers = new Map()
  for (const path of ['/health', '/session', '/school', '/auth/register', '/auth/login', '/auth/logout']) {
    // Resolve the physical entry points that Vercel deploys, including nested
    // auth paths. Calling the Express app alone missed the old routing bug.
    const endpoint = await import(`../api${path}.mjs`)
    assert.equal(endpoint.default, sharedHandler)
    handlers.set(`/api${path}`, endpoint.createVercelHandler(options))
  }
  return (req, res) => {
    const handler = handlers.get(req.url?.split('?')[0])
    if (handler) return handler(req, res)
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'This endpoint does not exist.' }))
  }
}

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
  const request = await serve(t, await deployedEndpoints({ databaseUrl: '' }))
  const session = await request('/session')
  assert.equal(session.response.status, 200)
  assert.deepEqual(session.body, { user: null, school: null })
  const health = await request('/health')
  assert.equal(health.response.status, 503)
  assert.equal(health.body.code, 'DATABASE_NOT_CONFIGURED')
  assert.equal(health.body.diagnosticVersion, 2)
  assert.equal(health.body.database.configured, false)
  const signup = await request('/auth/register', { name: 'Taylor Rivers', email: 'taylor@northbridge.edu', password: 'A long test passphrase 42!' })
  assert.equal(signup.response.status, 503)
  assert.equal(signup.body.code, 'DATABASE_NOT_CONFIGURED')
})

test('malformed connection URLs and unrelated startup failures are not mislabeled as missing bindings', async t => {
  const invalid = await serve(t, createVercelHandler({ databaseUrl: 'INVALID-PRIVATE-CONNECTION' }))
  const response = await invalid('/health')
  assert.equal(response.response.status, 503)
  assert.equal(response.body.code, 'DATABASE_URL_INVALID')
  assert.equal(response.body.database.configured, true)
  assert.doesNotMatch(JSON.stringify(response.body), /INVALID-PRIVATE-CONNECTION/)
  const logs = []
  const unexpected = await serve(t, createVercelHandler({ get store() { throw new Error('PRIVATE-INITIALIZATION-DETAILS') } }, details => logs.push(details)))
  const failed = await unexpected('/health')
  assert.equal(failed.body.code, 'API_INITIALIZATION_FAILED')
  assert.doesNotMatch(JSON.stringify(failed.body), /PRIVATE-INITIALIZATION-DETAILS/)
  assert.deepEqual(logs, [{ code: 'API_INITIALIZATION_FAILED', type: 'Error' }])
})

test('a valid PostgreSQL URL initializes the actual Neon client without touching local storage', async t => {
  const request = await serve(t, createVercelHandler({ databaseUrl: 'postgresql://fixture-user:fixture-password@fixture.example.test/fixture' }))
  const response = await request('/session')
  assert.equal(response.response.status, 200)
  assert.deepEqual(response.body, { user: null, school: null })
})

test('PostgreSQL authentication failures return a precise safe health response', async t => {
  const store = createPostgresStore('', { initialize: async () => { throw Object.assign(new Error('PRIVATE-CONNECTION-DETAILS'), { code: '28P01' }) }, query() {} })
  const request = await serve(t, createVercelHandler({ store }))
  const response = await request('/health')
  assert.equal(response.response.status, 503)
  assert.equal(response.body.code, 'DATABASE_AUTH_FAILED')
  assert.equal(response.body.diagnosticVersion, 2)
  assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE-CONNECTION-DETAILS/)
})

test('deployed endpoint files support signup, school setup, login, durable sessions and rate limits on PostgreSQL', async t => {
  const pg = new PGlite()
  const driver = { query: async (sql, parameters) => (await pg.query(sql, parameters)).rows, initialize: async schema => { await pg.exec(schema.join(';')) } }
  const firstStore = createPostgresStore('', driver)
  const request = await serve(t, await deployedEndpoints({ store: firstStore }))
  assert.deepEqual((await request('/health')).body, { status: 'ok' })
  assert.deepEqual((await request('/session')).body, { user: null, school: null })
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
  const wrong = await request('/auth/login', { ...credentials, password: 'incorrect password' })
  assert.equal(wrong.response.status, 401)
  const login = await request('/auth/login', credentials, registered.cookie)
  assert.equal(login.response.status, 200)
  assert.equal(login.body.school.budget, 75000.25)
  assert.equal((await request('/session', undefined, registered.cookie)).body.user, null)
  await request('/auth/logout', {}, login.cookie)
  assert.equal((await request('/session', undefined, login.cookie)).body.user, null)
  const rateKeys = (await pg.query('SELECT key, hits FROM rate_limits')).rows
  assert.ok(rateKeys.some(row => row.key.startsWith('auth:') && row.hits >= 3))
  // Expiration and rate limit timestamps exceed PostgreSQL's 32-bit integer range.
  assert.ok((await pg.query('SELECT reset_at FROM rate_limits LIMIT 1')).rows[0].reset_at > 2147483647)
  await pg.close()
})
