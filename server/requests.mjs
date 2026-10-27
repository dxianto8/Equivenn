import { randomUUID } from 'node:crypto'
import { rateLimit } from 'express-rate-limit'
import { DatabaseRateLimitStore } from './store.mjs'

const categories = ['Community', 'Academic', 'Arts & culture', 'Sports & wellbeing']
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const clean = value => typeof value === 'string' ? value.trim() : ''
const columns = `id, name, category, description, requested, members, impact, utilization, status,
  contact_name AS "contactName", contact_email AS "contactEmail", source, created_at AS "createdAt"`

function serialize(row) {
  return {
    ...row, requested: Number(row.requested), members: Number(row.members), impact: Number(row.impact),
    utilization: Number(row.utilization), createdAt: Number(row.createdAt),
    initials: row.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(),
    color: ['sage', 'blue', 'peach', 'purple'][categories.indexOf(row.category)],
  }
}

function validate(data) {
  const result = { id: clean(data?.id), name: clean(data?.name), category: clean(data?.category), description: clean(data?.description),
    requested: data?.requested, members: data?.members, impact: data?.impact, utilization: data?.utilization,
    contactName: clean(data?.contactName), contactEmail: clean(data?.contactEmail).toLowerCase() }
  if (!uuid.test(result.id) || result.name.length < 3 || result.name.length > 80 || !categories.includes(result.category) ||
      !result.description || result.description.length > 1000 || !Number.isFinite(result.requested) || result.requested < 1 || result.requested > 10000000 ||
      !Number.isInteger(result.members) || result.members < 1 || result.members > 1000000 ||
      ![result.impact, result.utilization].every(value => Number.isFinite(value) && value >= 0 && value <= 100) ||
      result.contactName.length < 2 || result.contactName.length > 80 || result.contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contactEmail)) return null
  return { ...result, requested: Math.round(result.requested * 100) / 100 }
}

export function registerRequestRoutes(app, db, requireUser) {
  const submissionLimiter = rateLimit({ store: new DatabaseRateLimitStore(db, 'funding:'), windowMs: 15 * 60 * 1000, limit: 20,
    standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many submissions. Please try again in 15 minutes.' } })
  const adminLimiter = rateLimit({ store: new DatabaseRateLimitStore(db, 'review:'), windowMs: 15 * 60 * 1000, limit: 120,
    standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many changes. Please try again shortly.' } })
  const portal = async ownerId => {
    let row = await db.prepare('SELECT token FROM request_portals WHERE owner_id = ?').get(ownerId)
    if (!row) {
      await db.prepare('INSERT INTO request_portals (owner_id, token) VALUES (?, ?) ON CONFLICT(owner_id) DO NOTHING').run(ownerId, randomUUID())
      row = await db.prepare('SELECT token FROM request_portals WHERE owner_id = ?').get(ownerId)
    }
    return row
  }
  const requireWorkspace = async (req, res, next) => {
    req.workspace = await db.prepare('SELECT name, workspace_name AS "workspaceName" FROM schools WHERE user_id = ?').get(req.account.id)
    if (!req.workspace) return res.status(403).json({ error: 'Connect your school before opening requests.' })
    next()
  }
  const findPublicPortal = async token => typeof token === 'string' && uuid.test(token) ? await db.prepare(`SELECT p.owner_id AS "ownerId", s.name AS "schoolName", s.workspace_name AS "workspaceName"
    FROM request_portals p JOIN schools s ON s.user_id = p.owner_id WHERE p.token = ?`).get(token) : null
  const insert = async (ownerId, data, source) => {
    // A client-generated UUID makes a retry safe after a lost response.
    await db.prepare(`INSERT INTO funding_requests (id, owner_id, name, category, description, requested, members, impact, utilization, status, contact_name, contact_email, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'In review', ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).run(
      data.id, ownerId, data.name, data.category, data.description, data.requested, data.members, data.impact, data.utilization, data.contactName, data.contactEmail, source, Date.now())
    return await db.prepare(`SELECT ${columns} FROM funding_requests WHERE id = ? AND owner_id = ?`).get(data.id, ownerId)
  }
  app.get('/api/requests', requireUser, requireWorkspace, async (req, res) => {
    const form = await portal(req.account.id)
    const rows = await db.prepare(`SELECT ${columns} FROM funding_requests WHERE owner_id = ? ORDER BY created_at DESC, id`).all(req.account.id)
    res.json({ organizations: rows.map(serialize), portal: { token: form.token, schoolName: req.workspace.name, workspaceName: req.workspace.workspaceName } })
  })
  app.post('/api/requests', requireUser, requireWorkspace, adminLimiter, async (req, res) => {
    if (req.body?.action === 'approve') {
      const id = clean(req.body.id)
      const row = await db.prepare('SELECT id FROM funding_requests WHERE id = ? AND owner_id = ?').get(id, req.account.id)
      if (!row) return res.status(404).json({ error: 'Request not found in this workspace.' })
      await db.prepare("UPDATE funding_requests SET status = 'Approved' WHERE id = ? AND owner_id = ?").run(id, req.account.id)
      return res.json({ organization: serialize(await db.prepare(`SELECT ${columns} FROM funding_requests WHERE id = ? AND owner_id = ?`).get(id, req.account.id)) })
    }
    if (req.body?.action !== 'create') return res.status(400).json({ error: 'Choose a valid request action.' })
    const data = validate({ ...req.body, contactName: req.account.name, contactEmail: req.account.email })
    if (!data) return res.status(400).json({ error: 'Check the organization details, funding amount, member count, and scores.' })
    await portal(req.account.id)
    const row = await insert(req.account.id, data, 'Admin')
    if (!row) return res.status(409).json({ error: 'This submission reference is already in use. Start a new request.' })
    res.status(201).json({ organization: serialize(row) })
  })
  app.get('/api/request-form', async (req, res) => {
    const form = await findPublicPortal(req.query.workspace)
    if (!form) return res.status(404).json({ error: 'This request form was not found. Ask your council for its current link.' })
    // Public readers can see form details, never the inbox or contact data.
    res.json({ schoolName: form.schoolName, workspaceName: form.workspaceName })
  })
  app.post('/api/request-form', submissionLimiter, async (req, res) => {
    const form = await findPublicPortal(req.body?.workspace)
    if (!form) return res.status(404).json({ error: 'This request form was not found. Ask your council for its current link.' })
    const data = validate(req.body)
    if (!data) return res.status(400).json({ error: 'Check your contact details, organization, funding amount, member count, and scores from 0 to 100.' })
    const row = await insert(form.ownerId, data, 'Public form')
    if (!row) return res.status(409).json({ error: 'This submission reference is already in use. Start a new request.' })
    res.status(201).json({ reference: row.id, status: 'In review' })
  })
}
