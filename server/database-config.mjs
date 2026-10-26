const standardNames = ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL', 'DATABASE_POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'DATABASE_POSTGRES_URL_NON_POOLING']
const databaseVariable = /^(?:[A-Za-z_][A-Za-z0-9_]*_)?(?:DATABASE_URL|POSTGRES_URL)(?:_UNPOOLED|_NON_POOLING)?$/i

const messages = {
  DATABASE_NOT_CONFIGURED: 'No database connection is configured for this deployment. Connect Neon to the Production environment and redeploy.',
  DATABASE_VARIABLE_AMBIGUOUS: 'Multiple prefixed database variables were found. Set DATABASE_URL explicitly in Vercel and redeploy.',
  DATABASE_URL_INVALID: 'The database variable is not a valid PostgreSQL connection URL. Update its value in Vercel and redeploy.',
  DATABASE_AUTH_FAILED: 'The database rejected the configured credentials. Update the connection in Vercel and redeploy.',
  DATABASE_PERMISSION_DENIED: 'The database connection does not have permission to initialize the account tables.',
  DATABASE_NAME_INVALID: 'The database named in the connection does not exist. Check the Neon connection in Vercel.',
  DATABASE_UNAVAILABLE: 'The database could not be reached. Check the Neon service and the connection configured in Vercel.',
  DATABASE_QUERY_FAILED: 'The account database returned an unexpected query error.',
  API_INITIALIZATION_FAILED: 'The account service could not start. Check the Vercel function logs for this deployment.',
}

export function databaseError(code) {
  const error = new Error(messages[code] || messages.API_INITIALIZATION_FAILED)
  error.code = code
  return error
}

export function databaseConfiguration(environment = process.env, override) {
  const presentVariables = Object.keys(environment).filter(name => databaseVariable.test(name)).sort()
  if (override !== undefined) return { url: typeof override === 'string' ? override.trim() : '', name: override ? 'explicit' : null, presentVariables }
  const active = presentVariables.filter(name => typeof environment[name] === 'string' && environment[name].trim())
  const pooled = active.filter(name => !/_(?:UNPOOLED|NON_POOLING)$/i.test(name))
  const name = standardNames.find(name => active.includes(name)) || (pooled.length === 1 ? pooled[0] : active.length === 1 ? active[0] : null)
  return {
    url: name ? environment[name].trim() : '', name, presentVariables,
    issue: !name && active.length > 1 ? 'DATABASE_VARIABLE_AMBIGUOUS' : null,
  }
}

export function databaseDiagnostics(configuration, hosted, environment = process.env) {
  // Explicit allowlist: never include connection values, usernames, passwords,
  // hosts, arbitrary environment entries, or driver exception messages.
  return {
    diagnosticVersion: 2,
    database: { configured: Boolean(configuration.url), variable: configuration.name, presentVariables: configuration.presentVariables },
    deployment: { environment: environment.VERCEL_ENV || (hosted ? 'hosted' : 'local'), commit: environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null },
  }
}

export function publicDatabaseFailure(error) {
  return Object.hasOwn(messages, error?.code) ? { error: messages[error.code], code: error.code } : null
}

export function classifyDatabaseFailure(error) {
  if (publicDatabaseFailure(error)) return error
  const codes = { '28P01': 'DATABASE_AUTH_FAILED', '28000': 'DATABASE_AUTH_FAILED', '42501': 'DATABASE_PERMISSION_DENIED', '3D000': 'DATABASE_NAME_INVALID' }
  return databaseError(codes[error?.code] || (/^[0-9A-Z]{5}$/.test(error?.code || '') ? 'DATABASE_QUERY_FAILED' : 'DATABASE_UNAVAILABLE'))
}
