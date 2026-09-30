# System Architecture

## 1. Overview

```
                 ┌──────────────────────────────────────────────┐
  Browser ─────► │  Next.js 14 App Router (RSC + Server Actions) │
                 │  Tailwind UI · Recharts · saved views         │
                 └───────────────┬──────────────────────────────┘
                                 │  session cookie (JWT, HttpOnly)
                 ┌───────────────▼──────────────────────────────┐
                 │  Application layer (src/lib)                  │
                 │  ├ auth + RBAC + tenancy guard                │
                 │  ├ scoring engine (rules + weights)           │
                 │  ├ recommendation engine (rank + diversify)   │
                 │  ├ outreach engine (templates + variations)   │
                 │  ├ AI provider abstraction (Anthropic|local)  │
                 │  ├ connector layer (CSV, LinkedIn, Lusha,     │
                 │  │   Apollo, CRM) + normalize + dedupe        │
                 │  └ audit + crypto + retention                 │
                 └───────────────┬──────────────────────────────┘
                                 │  Prisma
                 ┌───────────────▼──────────────┐   ┌──────────────────┐
                 │  PostgreSQL                  │   │  Job runner       │
                 │  tenant-scoped, JSONB config │◄──┤  (JobRun table,   │
                 └──────────────────────────────┘   │   worker process) │
                                                    └──────────────────┘
```

## 2. Layer responsibilities

| Layer | Path | Responsibility |
|---|---|---|
| Routing / UI | `src/app` | RSC pages, layouts, server actions. No business logic. |
| Components | `src/components` | Presentational + client-interactive UI. No Prisma imports. |
| Domain | `src/lib/**` | Scoring, recommendations, outreach, segmentation. Pure where possible → unit-testable. |
| Data access | `src/lib/db.ts`, `src/lib/tenancy.ts` | Prisma singleton + workspace-scoping helpers. |
| Integrations | `src/lib/integrations/*` | One module per provider behind a shared `Connector` interface. |
| AI | `src/lib/ai/*` | Provider-agnostic `AiProvider` interface; Anthropic adapter + deterministic heuristic fallback. |
| Jobs | `src/jobs/*` | Daily feed generation, rescoring, imports, retention sweep. |

**Dependency rule:** `app → lib → db`. Components never import Prisma; `lib`
never imports from `app`.

## 3. Request model

- **Reads**: React Server Components call `lib` functions directly. All pages are
  `dynamic = 'force-dynamic'` because every view is tenant- and session-scoped.
- **Writes**: Server Actions in `src/app/**/actions.ts`. Each action:
  1. `requireSession()` → resolves user + workspace + role,
  2. `assertPermission(role, 'lead:update')`,
  3. validates input with a Zod schema,
  4. performs the write inside a tenant-scoped query,
  5. writes an `AuditEvent` and (where user-visible) an `ActivityLog`,
  6. `revalidatePath()`.
- **Machine API**: `/api/v1/*` route handlers for CSV import, connector callbacks,
  cron triggers and health. Authenticated by session cookie or
  `x-api-key` (service token), never both implicitly.

## 4. AI layer

`AiProvider` exposes typed tasks rather than raw prompts:
`summarizeProfile`, `assessRelevance`, `draftMessage`, `qualificationQuestions`,
`summarizeThread`, `nextBestAction`, `explainRecommendation`.

Two implementations ship:
- `anthropic` — calls the Messages API with a strict JSON response contract, a
  redacted context payload (no raw email/phone) and a per-workspace token budget.
- `heuristic` — deterministic, offline, no network. Used when no API key is
  configured, in tests and in CI. **The product is fully functional without an AI
  key**; AI improves prose quality, it is not load-bearing for scoring or ranking.

Scoring and ranking are deterministic rule code, never model output — so results
are reproducible, explainable and auditable.

## 5. Background jobs

`JobRun` is a durable queue table (`status`, `scheduledFor`, `attempts`). A worker
(`npm run jobs:worker`) polls with `FOR UPDATE SKIP LOCKED` semantics via a
transactional claim. Job kinds: `daily_feed`, `rescore`, `enrich`, `import`,
`retention_sweep`. In serverless deployments the same handlers are triggered by
`POST /api/v1/cron/daily-feed` with `CRON_SECRET`. Swapping to BullMQ/pg-boss is a
drop-in change behind `src/jobs/queue.ts`.

## 6. Multi-tenancy

Every tenant row carries `workspaceId`. `tenancy.ts` exposes `scope(workspaceId)`
helpers and `assertSameWorkspace()` used before any mutation on a fetched entity,
so a guessed cuid from another tenant fails closed. Recommended production
hardening: Postgres RLS policies keyed on `app.workspace_id` (see SECURITY.md).

## 7. Deployment

Multi-stage `Dockerfile` (deps → build → runtime, non-root user, standalone
output) plus `docker-compose.yml` with Postgres, app and worker. `/api/health`
reports DB connectivity for load-balancer probes. Runs equally on Vercel +
managed Postgres, with cron hitting the cron endpoint.
