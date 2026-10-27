import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

test('a frontend-only deployment reports the missing account service and retry restores onboarding', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Static frontend</body></html>' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign-in is unavailable right now.' })).toBeVisible()
  await expect(page.getByText('Sign-in is not available on this deployment yet. Please contact the workspace administrator.')).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await page.unroute('**/api/session')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Big ideas start with you.' })).toBeVisible()
})

test('signup loads after an earlier static deployment cached HTML at the session URL', async ({ page, baseURL }) => {
  let apiReady = false
  let freshSessionRequests = 0
  // Use a real HTTP cache: Playwright request interception disables caching.
  const server = createServer(async (request, response) => {
    if (request.url === '/prime') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<!doctype html><title>Earlier deployment</title>')
      return
    }
    if (request.url === '/api/session') {
      if (!apiReady) {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' })
        response.end('<!doctype html><title>Static frontend</title>')
      } else {
        freshSessionRequests++
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        response.end(JSON.stringify({ user: null, school: null }))
      }
      return
    }
    try {
      const upstream = await fetch(new URL(request.url || '/', baseURL))
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name))))
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(response)
      else response.end()
    } catch { response.writeHead(502); response.end() }
  })
  server.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test proxy did not start')
  const origin = `http://127.0.0.1:${address.port}`
  try {
    await page.goto(`${origin}/prime`)
    expect(await page.evaluate(async () => (await fetch('/api/session')).headers.get('content-type'))).toBe('text/html')
    apiReady = true
    // Confirm that the stale response is cached even after the server changes.
    expect(await page.evaluate(async () => (await fetch('/api/session')).headers.get('content-type'))).toBe('text/html')
    expect(freshSessionRequests).toBe(0)
    await page.goto(origin)
    await expect(page.getByRole('heading', { name: 'Big ideas start with you.' })).toBeVisible()
    expect(freshSessionRequests).toBeGreaterThan(0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
