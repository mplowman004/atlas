# Atlas Lending Dashboard

Atlas is a Utah County commercial lending intelligence dashboard that turns verified permit and parcel signals into prioritized opportunities, referrals, and follow-up work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/atlas-lending` — React + Vite dashboard with morning brief, opportunities, referrals, signals, and source/rules views.
- `artifacts/api-server/src/routes/atlas.ts` — Atlas dashboard API routes and the seeded Utah County demo baseline.
- `lib/api-spec/openapi.yaml` — source of truth for the Atlas API contract.
- `lib/api-client-react/src/generated` and `lib/api-zod/src/generated` — generated client hooks and server validation schemas.

## Architecture decisions

- The frontend consumes generated React Query hooks from the OpenAPI contract rather than hand-written fetchers.
- Source quality is visible as a first-class dashboard concept: verified, review-required, and rejected records are not blended together.
- Product hypotheses are intentionally labeled as estimates and are separate from confirmed borrower intent.
- Ingest is bounded and repeatable through a small request contract so a future official-source connector can replace the demo baseline without changing the dashboard surface.

## Product

- Morning brief with pipeline bands, source coverage, significant signal changes, and follow-ups due.
- Filterable lending opportunities ranked by score with product hypothesis, estimated range, property context, and verification state.
- Referral queue, signal audit trail, source freshness, decision thresholds, and controlled ingest feedback.

## User preferences

_No persistent preferences recorded._

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before checking frontend or backend types.
- Artifact workflows provide `PORT` and `BASE_PATH`; use the managed workflow or preview rather than running the Vite command without those variables.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
