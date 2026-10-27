import { createAuthApp } from './auth.mjs'
import { databaseConfiguration, databaseDiagnostics, publicDatabaseFailure } from './database-config.mjs'

export function createVercelHandler(options = {}, reportError = details => console.error('[Equivenn] Account service initialization failed', details)) {
  let service
  return (req, res) => {
    try {
      service ||= createAuthApp({ hosted: true, secureCookies: true, ...options })
      return service.app(req, res)
    } catch (error) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      const failure = publicDatabaseFailure(error) || { error: 'The account service could not start. Check the Vercel function logs for this deployment.', code: 'API_INITIALIZATION_FAILED' }
      if (failure.code === 'API_INITIALIZATION_FAILED') reportError({ code: failure.code, type: ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error' })
      const health = req.url?.split('?')[0] === '/api/health'
      res.end(JSON.stringify({ ...failure, ...(health ? databaseDiagnostics(databaseConfiguration(process.env, options.databaseUrl), true) : {}) }))
    }
  }
}

// Explicit files in api/ expose this shared service at every supported URL.
// Vercel's generic function routing does not expand [...path] across slashes.
export default createVercelHandler()
