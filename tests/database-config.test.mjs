import test from 'node:test'
import assert from 'node:assert/strict'
import { databaseConfiguration, databaseDiagnostics, classifyDatabaseFailure } from '../server/database-config.mjs'

test('database configuration recognizes Neon and Vercel prefixes and prefers the standard pooled binding', () => {
  const configuration = databaseConfiguration({ DATABASE_URL: '  standard-private-value  ', DATABASE_POSTGRES_URL: 'prefixed-private-value', DATABASE_POSTGRES_URL_NON_POOLING: 'unpooled-private-value', DATABASE_URL_UNPOOLED: 'other-private-value' })
  assert.equal(configuration.name, 'DATABASE_URL')
  assert.equal(configuration.url, 'standard-private-value')
  assert.equal(databaseConfiguration({ DATABASE_POSTGRES_URL: 'connection' }).name, 'DATABASE_POSTGRES_URL')
  assert.equal(databaseConfiguration({ NEON_DATABASE_URL: 'connection' }).name, 'NEON_DATABASE_URL')
  assert.equal(databaseConfiguration({ SCHOOL_DATABASE_URL: 'pooled', SCHOOL_DATABASE_URL_UNPOOLED: 'unpooled' }).name, 'SCHOOL_DATABASE_URL')
})

test('empty bindings and ambiguous databases are distinguished without selecting an unrelated database', () => {
  assert.equal(databaseConfiguration({ DATABASE_URL: '  ', DATABASE_POSTGRES_URL: 'connection' }).name, 'DATABASE_POSTGRES_URL')
  assert.equal(databaseConfiguration({ DATABASE_URL: '' }).url, '')
  assert.equal(databaseConfiguration({ SCHOOL_DATABASE_URL: 'one', OTHER_DATABASE_URL: 'two' }).issue, 'DATABASE_VARIABLE_AMBIGUOUS')
  assert.equal(databaseConfiguration({ DATABASE_POSTGRES_URL_NO_SSL: 'unsafe', DATABASE_VITE_NEON_AUTH_URL: 'auth' }).url, '')
})

test('health diagnostics reveal only binding names and deployment metadata, never secret values', () => {
  const configuration = databaseConfiguration({ DATABASE_URL: 'NEVER-EXPOSE-THIS-CONNECTION', OTHER_SECRET: 'NEVER-EXPOSE-THIS-SECRET' })
  const diagnostics = databaseDiagnostics(configuration, true, { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: '0123456789abcdef' })
  assert.deepEqual(diagnostics.database, { configured: true, variable: 'DATABASE_URL', presentVariables: ['DATABASE_URL'] })
  assert.equal(diagnostics.diagnosticVersion, 2)
  assert.equal(diagnostics.deployment.commit, '0123456')
  assert.doesNotMatch(JSON.stringify(diagnostics), /NEVER-EXPOSE|OTHER_SECRET/)
})

test('database failures distinguish authentication, permissions, database names, query errors and connectivity', () => {
  for (const [code, expected] of [['28P01', 'DATABASE_AUTH_FAILED'], ['42501', 'DATABASE_PERMISSION_DENIED'], ['3D000', 'DATABASE_NAME_INVALID'], ['42601', 'DATABASE_QUERY_FAILED'], ['ETIMEDOUT', 'DATABASE_UNAVAILABLE']]) {
    const failure = classifyDatabaseFailure(Object.assign(new Error('private-driver-message'), { code }))
    assert.equal(failure.code, expected)
    assert.doesNotMatch(failure.message, /private-driver-message/)
  }
})
