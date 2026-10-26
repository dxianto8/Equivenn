# Equivenn

A transparent organizational budget allocator built with React, TypeScript, and Vite. A working local workspace includes eight sample student organizations and a Fall 2026 funding cycle.

## Develop

Use Node.js 24 and npm 11 (validated with Node 24.19.0 and npm 11.9.0).

```sh
cd /workspace/EquiFund
npm ci
npm run dev -- --port 3000
```

The server binds to all interfaces. For a production build, run `npm run build`; `npm run preview -- --port 3000` serves that build for validation.

```sh
npm test          # Allocation invariants and edge cases
npm run build    # Strict TypeScript check and production bundle
npm run test:e2e # Desktop lifecycle and mobile interaction tests
```

Browser tests use the system Chromium when available. Otherwise run `npx playwright install chromium`, or set `CHROMIUM_PATH` to an installed Chromium executable. No credentials or external services are needed. Dependencies and font files are fetched from the npm registry during installation; runtime fonts are bundled locally.

## What works

- Budget overview, requested-versus-allocated charts, and category analytics.
- Funding request submission with standardized membership, impact, utilization, and efficiency inputs.
- Eligibility review: new requests remain excluded until approved.
- Adjustable funding pool, reserve, and four published scoring weights, with a live preview.
- Deterministic allocation and a per-organization explanation of every score and award.
- Search, category filters, request status tabs, and sortable table columns.
- A published cycle record with a timestamp, captured metrics, awards, and policy.
- CSV export including the scoring weights and reserve policy. Text cells that could be interpreted as spreadsheet formulas are escaped.
- Browser persistence, responsive navigation, keyboard-accessible dialogs, and reduced-motion support.

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

This is a local-first application: requests, policy, and the published cycle record are persisted in this browser's local storage under the original versioned `equifund.*.v1` keys, retained to preserve workspace data across the Equivenn rebrand. Initial data is illustrative. Use a separate browser profile for a fresh demo; export important records before clearing site data.

Publishing creates a record in this workspace; it does not publish a public website. Cross-device collaboration, authentication, independent data verification, audit history, and a remotely accessible public ledger require a backend and are not connected. The application is a decision-support tool, not a financial payment system.

## Cloud startup

Use the existing `/workspace/EquiFund` checkout. Each cloud task is already isolated; do not create a Git worktree unless explicitly requested. Installed files and build outputs may be retained in the environment snapshot, but development-server processes must restart in a new task. The saved environment startup instructions describe server startup and readiness checks.
