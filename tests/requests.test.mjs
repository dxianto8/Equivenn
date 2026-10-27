import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { PGlite } from '@electric-sql/pglite'
import { createSQLiteStore, createPostgresStore } from '../server/store.mjs'
import { createVercelHandler } from '../server/vercel.mjs'

const credentials = { name: 'Jamie Lewis', email: 'jamie@northbridge.edu', password: 'A long test passphrase 42!' }
const school = { name: 'Northbridge University', domain: 'northbridge.edu', email: credentials.email, role: 'Treasurer', workspaceName: 'Student Council', budget: 75000, sampleData: true }
const application = () => ({ id: randomUUID(), name: 'Campus Coding Society', category: 'Academic', description: 'Open coding workshops and equipment for students.', requested: 12500.25, members: 150, impact: 88, utilization: 90, contactName: 'Alex Rivers', contactEmail: 'alex@northbridge.edu' })

async function fixture(t, postgres = false) {
  const dir = mkdtempSync(join(tmpdir(), 'equivenn-requests-'))
  const pg = postgres ? new PGlite() : null
  const driver = pg && { query: async (sql, parameters) => (await pg.query(sql, parameters)).rows, initialize: async schema => { await pg.exec(schema.join(';')) } }
  const stores = [], servers = []
  const start = async () => {
    const store = pg ? createPostgresStore('', driver) : createSQLiteStore(join(dir, 'requests.sqlite'))
    stores.push(store)
    const handlers = new Map()
    for (const path of ['/health', '/session', '/school', '/auth/register', '/auth/login', '/requests', '/request-form']) {
      const module = await import(`../api${path}.mjs`)
      assert.equal(module.createVercelHandler, createVercelHandler)
      handlers.set(`/api${path}`, module.createVercelHandler({ store, secureCookies: false }))
    }
    const server = createServer((req, res) => {
      const handler = handlers.get(req.url.split('?')[0])
      if (handler) return handler(req, res)
      res.writeHead(404); res.end()
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    return async (path, data, cookie, requestOrigin = origin) => {
      const response = await fetch(`${origin}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', Origin: requestOrigin }), ...(cookie ? { Cookie: cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
      assert.match(response.headers.get('content-type'), /application\/json/)
      return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
  }
  t.after(async () => {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    for (const store of stores) store.close()
    await pg?.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return { request: await start(), start }
}

for (const postgres of [false, true]) test(`${postgres ? 'PostgreSQL' : 'SQLite'}: public submissions reach only their admin, persist across instances, and require approval`, async t => {
  const { request, start } = await fixture(t, postgres)
  assert.equal((await request('/requests')).response.status, 401)
  const first = await request('/auth/register', credentials)
  assert.equal((await request('/requests', undefined, first.cookie)).response.status, 403)
  const connected = await request('/school', school, first.cookie)
  assert.equal(connected.body.school.sampleData, false)
  const initial = await request('/requests', undefined, first.cookie)
  assert.deepEqual(initial.body.organizations, [])
  const workspace = initial.body.portal.token
  const details = await request(`/request-form?workspace=${workspace}`)
  assert.deepEqual(details.body, { schoolName: school.name, workspaceName: school.workspaceName })
  assert.equal((await request('/request-form?workspace=invalid')).response.status, 404)
  for (const change of [{ requested: -1 }, { requested: '12500' }, { members: 0 }, { members: 1.5 }, { impact: 101 }, { utilization: null }, { category: 'Unknown' }, { contactEmail: 'invalid' }]) {
    assert.equal((await request('/request-form', { ...application(), workspace, ...change })).response.status, 400)
  }
  const data = { ...application(), workspace, status: 'Approved', ownerId: 'untrusted' }
  assert.equal((await request('/request-form', data, undefined, 'https://unrelated.example')).response.status, 403)
  const sent = await request('/request-form', data)
  assert.equal(sent.response.status, 201)
  assert.deepEqual(sent.body, { reference: data.id, status: 'In review' })
  assert.equal((await request('/request-form', data)).response.status, 201)
  assert.equal((await request('/requests', { action: 'approve', id: data.id })).response.status, 401)
  const inbox = (await request('/requests', undefined, first.cookie)).body
  assert.equal(inbox.organizations.length, 1)
  assert.equal(inbox.organizations[0].requested, 12500.25)
  assert.equal(inbox.organizations[0].contactEmail, data.contactEmail)
  assert.equal(inbox.organizations[0].status, 'In review')
  assert.equal(inbox.organizations[0].source, 'Public form')

  const second = await request('/auth/register', { ...credentials, email: 'other@northbridge.edu' })
  await request('/school', { ...school, email: 'other@northbridge.edu', role: 'Administrator' }, second.cookie)
  assert.deepEqual((await request('/requests', undefined, second.cookie)).body.organizations, [])
  assert.equal((await request('/requests', { action: 'approve', id: data.id }, second.cookie)).response.status, 404)
  const approved = await request('/requests', { action: 'approve', id: data.id }, first.cookie)
  assert.equal(approved.body.organization.status, 'Approved')
  const anotherInstance = await start()
  const persisted = (await anotherInstance('/requests', undefined, first.cookie)).body
  assert.equal(persisted.organizations[0].status, 'Approved')
  assert.equal(persisted.portal.token, workspace)
  const adminCreated = await anotherInstance('/requests', { ...application(), id: randomUUID(), action: 'create', contactEmail: 'ignored@example.com' }, first.cookie)
  assert.equal(adminCreated.response.status, 201)
  assert.equal(adminCreated.body.organization.contactEmail, credentials.email)
  assert.equal((await request('/requests', undefined, first.cookie)).body.organizations.length, 2)
})

test('public submissions are rate limited even without an account', async t => {
  const { request } = await fixture(t)
  for (let i = 0; i < 20; i++) assert.equal((await request('/request-form', { workspace: 'invalid' })).response.status, 404)
  const response = await request('/request-form', { workspace: 'invalid' })
  assert.equal(response.response.status, 429)
  assert.ok(response.response.headers.has('retry-after'))
})
