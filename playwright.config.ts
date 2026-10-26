import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', launchOptions: { executablePath, args: ['--no-sandbox'] } },
  webServer: { command: 'npm run dev -- --port 3100 --strictPort', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false, env: { AUTH_DB_PATH: `.data/e2e-${process.pid}.sqlite`, COOKIE_SECURE: 'false', NODE_ENV: 'test', VITE_CACHE_DIR: 'node_modules/.vite-e2e' } },
})
