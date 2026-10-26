import express from 'express'
import { resolve } from 'node:path'
import { createAuthApp } from './auth.mjs'

const { app, close } = createAuthApp()
app.use((_req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
  next()
})
app.use(express.static(resolve('dist')))
app.get(/.*/, (_req, res) => res.sendFile(resolve('dist/index.html')))
const port = Number(process.env.PORT || 3000)
const server = app.listen(port, '0.0.0.0', () => console.log(`Equivenn is listening on port ${port}`))
const shutdown = () => server.close(() => { close(); process.exit(0) })
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
