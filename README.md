# Equivenn

A transparent organizational budget allocator built with React, TypeScript, Vite, and a Node.js account service. First-time visitors create an account, connect a school, and set up a workspace before reaching the dashboard.

## Develop

Use Node.js 24 and npm 11 (validated with Node 24.19.0 and npm 11.9.0).

```sh
cd /workspace/EquiFund
npm ci
npm run dev -- --port 3000
```

The server binds to all interfaces. Vite mounts the account API on the same origin automatically, so one command starts the complete development workflow. For a production build, run `npm run build`, then `npm start` to serve both the app and API. `npm run preview -- --port 4173` also includes the API for local build validation.

```sh
npm test          # Allocation invariants and account API integration tests
npm run build    # Strict TypeScript check and production bundle
npm run test:e2e # Account onboarding, login, isolation, desktop lifecycle, mobile
```

Browser tests use the system Chromium when available. Otherwise run `npx playwright install chromium`, or set `CHROMIUM_PATH` to an installed Chromium executable. They start their own Vite server on port 3100 with a separate test database and dependency cache; keep that port free. No external credentials or services are needed. Dependencies and font files are fetched from the npm registry during installation; runtime fonts are bundled locally.

## What works

- Required account creation, returning-user sign-in, session restoration, and sign-out.
- Three-step onboarding: your account, your school, and your workspace. Incomplete accounts resume school setup on reload and cannot reach the dashboard.
- School-domain/email matching, self-reported role, custom school/workspace names, starting budget, and an optional sample dataset. School affiliation is explicitly unverified.
- Personalized dashboard identity and separate browser funding data for each signed-in account.
- Budget overview, requested-versus-allocated charts, and category analytics.
- Funding request submission with standardized membership, impact, utilization, and efficiency inputs.
- Eligibility review: new requests remain excluded until approved.
- Adjustable funding pool, reserve, and four published scoring weights, with a live preview.
- Deterministic allocation and a per-organization explanation of every score and award.
- Search, category filters, request status tabs, and sortable table columns.
- A published cycle record with a timestamp, captured metrics, awards, and policy.
- CSV export including the scoring weights and reserve policy. Text cells that could be interpreted as spreadsheet formulas are escaped.
- JavaScript animations with Motion: onboarding transitions, floating artwork, staggered dashboard reveals, animated chart bars, and budget counters. OS reduced-motion preferences are respected.
- Browser persistence, responsive navigation, and keyboard-accessible dialogs.

## Accounts and server storage

Node.js 24 provides the built-in SQLite driver. The service automatically creates `.data/equivenn.sqlite` with private filesystem permissions. Accounts, salted scrypt password hashes, school connections, and hashed session tokens are stored there. Raw passwords and raw session tokens are not stored in the database. Sessions expire after seven days and use HttpOnly, SameSite=Lax cookies. Sign-out revokes the server session. Account attempts are rate limited, mutations reject cross-origin requests, and account responses disable caching.

The database directory is ignored by Git. Keep it on persistent, private storage and back it up when deploying; do not commit it or publish it as a static asset. `AUTH_DB_PATH` selects a different writable database file. `PORT` selects the production listener (default 3000). Use `NODE_ENV=production` or `COOKIE_SECURE=true` behind HTTPS to require Secure cookies. Local HTTP development uses non-Secure cookies. A static-only host cannot run the account API; use `npm start` on a Node.js host or a compatible backend deployment.

School connection links self-reported institution details to an account. Matching an email domain does not verify ownership or affiliation. School SSO, email verification, password recovery, and joining a shared institution-managed workspace are not connected. Do not present the role or school name as verified identity or administrative authorization.

## Allocation model

The default budget is $120,000, with a 6% reserve and $112,800 available to award. Eligible organizations receive normalized scores from four metrics:

| Metric | Default weight | Calculation |
| --- | ---: | --- |
| Member reach | 30% | Square root of membership / highest eligible square root of membership |
| Community impact | 35% | Standardized impact score / 100 |
| Past utilization | 20% | Verified utilization percentage / 100 |
| Cost efficiency | 15% | Square root of members per requested dollar / highest eligible value |

The engine maximizes `Σ scoreᵢ × log(awardᵢ)` subject to the distributable budget and an individual cap at the requested amount. Capped water filling redistributes excess from fully funded requests. Largest-remainder rounding conserves cents; stable organization IDs break rounding ties. If all eligible requests are funded, any excess stays unallocated. In-review organizations do not affect normalization or receive awards.

Consistent calculations do not eliminate policy or input bias. Councils must agree on eligibility, a shared impact rubric, verified membership, and an explicit starting utilization policy for new organizations. Weights remain visible and editable. An input or policy change invalidates the published record until the revised allocation is reviewed and published again.

## Storage and scope

Accounts and school details live on the server. Funding requests, policy changes, and published cycle records are still local to the signed-in account in this browser, under `equivenn.<account-id>.*.v1` keys. Signing into another account does not expose the first account's workspace through the UI. Older unscoped `equifund.*.v1` browser data is retained untouched and is not automatically attached to an account. Initial organizations are illustrative and optional during setup. Export important records before clearing site data.

Publishing creates a record in this browser workspace; it does not publish a public website. Funding data synchronization, cross-device collaboration, independent data verification, audit history, and a remotely accessible public ledger are not connected. The application is a decision-support tool, not a financial payment system.

## Cloud startup

Use the existing `/workspace/EquiFund` checkout. Each cloud task is already isolated; do not create a Git worktree unless explicitly requested. Installed files and build outputs may be retained in the environment snapshot, but development-server processes must restart in a new task. The saved environment startup instructions describe server startup and readiness checks.
