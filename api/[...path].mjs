import { createAuthApp } from '../server/auth.mjs'

export function createVercelHandler(options = {}) {
  let service
  return (req, res) => {
    try {
      service ||= createAuthApp({ hosted: true, secureCookies: true, ...options })
      return service.app(req, res)
    } catch {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ error: 'Account setup has not been completed for this site. Please contact the workspace administrator.', code: 'DATABASE_NOT_CONFIGURED' }))
    }
  }
}

// Vercel routes /api/session, /api/auth/*, and /api/school to this function.
// Accounts and sessions use durable Neon storage, never ephemeral local files.
export default createVercelHandler()
