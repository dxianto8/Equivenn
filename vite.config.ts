import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAuthApp } from './server/auth.mjs'
import { resolve } from 'node:path'

const databasePath = resolve(process.env.AUTH_DB_PATH || '.data/equivenn.sqlite')

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/*.sqlite', '**/*.sqlite-*', databasePath, `${databasePath}-*`] } },
  plugins: [react(), {
    name: 'equivenn-accounts',
    configureServer(server) {
      const auth = createAuthApp()
      server.middlewares.use(auth.app)
      server.httpServer?.once('close', auth.close)
    },
    configurePreviewServer(server) {
      const auth = createAuthApp()
      server.middlewares.use(auth.app)
      server.httpServer.once('close', auth.close)
    },
  }],
})
