import test from 'node:test'
import assert from 'node:assert/strict'
import { allocate, defaultModel, initialOrganizations } from '../src/lib/allocation.ts'

const sum = rows => Math.round(rows.reduce((s, r) => s + r.award, 0) * 100) / 100
const organization = (id, requested = 1000) => ({ id, name: id, initials: id, category: 'Academic', color: 'blue', requested, members: 100, impact: 80, utilization: 90, status: 'Approved', description: 'Test organization' })

test('sample allocation spends exactly the distributable pool and preserves the reserve', () => {
  const rows = allocate(initialOrganizations, defaultModel)
  assert.equal(rows.length, 8)
  assert.equal(sum(rows), 112800)
  for (const row of rows) {
    assert.ok(row.award > 0 && row.award <= row.requested)
    assert.ok(row.score >= 0 && row.score <= 1)
    for (const factor of Object.values(row.factors)) assert.ok(factor >= 0 && factor <= 1)
  }
})

test('equal metrics receive equal awards, independent of requested size when no cap binds', () => {
  const rows = allocate([organization('a', 1000), organization('b', 2000)], { budget: 1000, reserve: 0, weights: { reach: 50, impact: 50, utilization: 0, efficiency: 0 } })
  assert.equal(rows[0].award, 500)
  assert.equal(rows[1].award, 500)
})

test('capped requests redistribute their excess without exceeding any request', () => {
  const rows = allocate([organization('a', 100), organization('b', 1000), organization('c', 1000)], { ...defaultModel, budget: 1000, reserve: 0, weights: { reach: 100, impact: 0, utilization: 0, efficiency: 0 } })
  assert.deepEqual(rows.map(r => r.award), [100, 450, 450])
  assert.equal(sum(rows), 1000)
})

test('unused funding stays unallocated when every request is fully funded', () => {
  const rows = allocate([organization('a', 100), organization('b', 100)], { ...defaultModel, budget: 1000, reserve: 0 })
  assert.equal(sum(rows), 200)
})

test('in-review requests receive zero and do not affect other scores or allocations', () => {
  const original = [organization('a'), organization('b')]
  const pending = { ...organization('c', 100000), members: 10000, status: 'In review' }
  const model = { ...defaultModel, budget: 1000 }
  const expected = allocate(original, model)
  const actual = allocate([...original, pending], model)
  assert.deepEqual(actual.slice(0, 2), expected)
  assert.equal(actual[2].award, 0)
  assert.equal(actual[2].score, 0)
})

test('cent rounding is deterministic and remains independent of input order', () => {
  const orgs = ['c', 'b', 'a'].map(id => organization(id))
  const model = { ...defaultModel, budget: 100, reserve: 0 }
  const rows = allocate(orgs, model)
  const reversed = allocate([...orgs].reverse(), model)
  assert.equal(sum(rows), 100)
  assert.equal(rows.find(r => r.id === 'a').award, 33.34)
  for (const row of rows) assert.equal(row.award, reversed.find(r => r.id === row.id).award)
})

test('efficiency and square-root reach normalize to the best approved value', () => {
  const rows = allocate(initialOrganizations, defaultModel)
  assert.equal(Math.max(...rows.map(r => r.factors.efficiency)), 1)
  assert.equal(Math.max(...rows.map(r => r.factors.reach)), 1)
})

test('empty pool, full reserve, no eligible requests, and zero weights allocate nothing', () => {
  assert.deepEqual(allocate([], defaultModel), [])
  assert.equal(sum(allocate(initialOrganizations, { ...defaultModel, budget: 0 })), 0)
  assert.equal(sum(allocate(initialOrganizations, { ...defaultModel, reserve: 100 })), 0)
  assert.equal(sum(allocate(initialOrganizations, { ...defaultModel, weights: { reach: 0, impact: 0, utilization: 0, efficiency: 0 } })), 0)
})

test('allocations conserve the budget over varied requests, caps, and reserves', () => {
  for (let count = 1; count <= 30; count++) {
    const orgs = Array.from({ length: count }, (_, i) => ({ ...organization(String(i), 100 + ((i * 173) % 1000)), members: 10 + i * 23, impact: 40 + i % 60 }))
    const model = { ...defaultModel, budget: 100.37 + count * 73.19, reserve: count % 21 }
    const rows = allocate(orgs, model)
    const availableCents = Math.floor(model.budget * (1 - model.reserve / 100) * 100 + 1e-6)
    const requestCents = orgs.reduce((s, o) => s + Math.round(o.requested * 100), 0)
    assert.equal(Math.round(sum(rows) * 100), Math.min(availableCents, requestCents))
    for (const row of rows) assert.ok(row.award <= row.requested)
  }
})
