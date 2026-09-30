# Ahad Customer Intelligence & Outreach Platform

A customer-intelligence platform that turns a compliant pool of accounts and
contacts into a ranked, explained, **daily list of ten decision-makers to
approach** — each with the reason it is there, the offer angle to lead with, the
channel to use and a human-approved draft.

Built for Ahad's practice areas across UAE, Saudi Arabia, the GCC and MENA:
cybersecurity, compliance and GRC, advanced cyber defense, digital
transformation, AI governance and implementation, enterprise risk reduction and
security modernization.

> **It is not a scraper and not an auto-sender.** Data comes from your own
> subscriptions and exports through official APIs; every outbound message passes
> a human approval gate. See [Compliance](#compliance) below.

---

## Quick start

```bash
cd ahad-intel
cp .env.example .env            # then set AUTH_SECRET and APP_ENCRYPTION_KEY
npm install
npm run db:push                 # or: npm run db:migrate
npm run db:seed                 # illustrative GCC/MENA demo data
npm run dev
```

Generate the first daily feed:

```bash
npm run jobs:daily-feed         # or click "Generate today's feed" in the UI
```

Open <http://localhost:3000> and sign in with a seeded account:

| Email | Role | What they can do |
|---|---|---|
| `owner@ahad.example` | Owner | Everything |
| `admin@ahad.example` | Admin | Settings, integrations, members, audit |
| `manager@ahad.example` | Manager | Campaigns, assignment, approvals |
| `rep1@ahad.example` | Rep | Own leads, drafts, replies |
| `analyst@ahad.example` | Analyst | Import, enrich, score, tune the ICP |

Password for all seeded users: `AhadDemo!2025` (override with `SEED_PASSWORD`).
**Change or remove these before any deployment.**

### Generating the required secrets

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY (must decode to exactly 32 bytes)
openssl rand -base64 32   # CRON_SECRET
```

Production refuses to boot without `AUTH_SECRET` and `APP_ENCRYPTION_KEY`.

### Docker

```bash
export AUTH_SECRET=... APP_ENCRYPTION_KEY=...
docker compose up --build
docker compose exec app npx prisma migrate deploy
```

Compose runs Postgres, the app and a background worker. `/api/health` reports
database connectivity for load-balancer and container probes.

---

## What it does

### 1. Daily Priority Feed — the core loop
Ten prospects a day, ranked and **diversified** so the team is not sent at ten
near-identical leads. Each card carries:

- ICP fit, intent, urgency and priority scores
- a plain-English reason, with the top contributing factors
- the suggested offer angle and an approved message variation
- the recommended channel and the next best action
- accept / snooze / dismiss controls, which train the engine

Diversity caps: **one lead per account** (an invariant — never relaxed), at most
3 per vertical, 5 per region, 4 per persona, 4 per owner. Other caps relax
automatically if the pool is too small to fill ten slots.

### 2. Deterministic, explainable scoring
Four dimensions — ICP fit, intent, urgency, deal potential — combined into a
priority score. **Scoring is rule code, not model output**, so it is
reproducible, auditable and explainable. Every score comes with a breakdown of
which rule contributed what and why. Admins add workspace-specific rules through
a declarative predicate language without touching code.

Full design: [`docs/SCORING.md`](docs/SCORING.md).

### 3. Human-approved outreach
Drafts are generated per persona, angle, region and tone, with alternative
approaches to choose from. Only **approved** templates are offered as variations,
weighted by observed reply rate with an exploration floor so new copy still gets
tested. Authors cannot approve their own drafts; editing an approved draft
returns it to review.

### 4. Compliant ingestion
Manual entry, CSV/spreadsheet, user-provided LinkedIn exports, Lusha and Apollo
through their official APIs on your own subscription, and CRM sync. Normalisation,
deduplication and provenance are shared by every connector, so adding a provider
is one module plus one registry line.

### 5. Analytics that answer real questions
Which geographies produce opportunities, which verticals respond, which personas
engage, which angles convert, where the team is wasting time, and whether the
daily picks actually lead to conversations.

---

## Compliance

This is the constraint the product is designed around, not a disclaimer.

**Supported data paths**
- Official provider APIs (Lusha, Apollo, CRM) using **your own** credentials and subscription.
- Data you already hold: manual entry, CSV, spreadsheets.
- LinkedIn exports **you** downloaded from your own account, or that your licence permits.
- Manual, browser-assisted research a person performs, recorded as notes and a reference URL.

**Never implemented, and not on the roadmap**
- Scraping or fetching any linkedin.com page, in any form.
- Cookie or session replay, or driving a logged-in browser.
- Automating connection requests, messages or InMail.
- Bypassing rate limits, login walls, CAPTCHAs or robots directives.
- Sending anything without a named person approving the content.
- Contacting anyone recorded as opted out.

Connectors declare their permitted and prohibited uses in code; the UI renders
those statements verbatim, and an admin must **attest** to them before credentials
can be stored. The attestation gate is enforced in `loadCredentials()`, so a
direct call cannot bypass it.

Opt-out is honoured at every stage: feed generation, drafting, approval, sending
and enrichment. A reply classified as an opt-out suppresses the contact and
archives their pending drafts in the same transaction.

---

## Architecture

```
Next.js 14 App Router (RSC + Server Actions) · Tailwind · Recharts
        │
        ├── src/lib/auth · rbac · tenancy · audit · crypto
        ├── src/lib/scoring        deterministic engine + configurable rules
        ├── src/lib/recommendations  ranking, diversification, reasons
        ├── src/lib/outreach       templates, variation selection, rendering
        ├── src/lib/ai             provider-agnostic (Anthropic | heuristic)
        └── src/lib/integrations   pluggable connectors + normalize/dedupe
        │
   Prisma → PostgreSQL          src/jobs → durable JobRun queue + worker
```

Dependency rule: `app → lib → db`. Components never import Prisma; `lib` never
imports from `app`.

**The AI layer is optional.** Without an API key the platform runs on a
deterministic offline provider: scoring, ranking and the daily feed never depend
on a model, and drafting degrades to strong templated copy. Set
`AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to improve prose quality.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`docs/ERD.md`](docs/ERD.md) · [`docs/API_PLAN.md`](docs/API_PLAN.md)

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) | Problem, users, outcomes, acceptance criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, request model, jobs, tenancy, deployment |
| [`docs/ERD.md`](docs/ERD.md) | Entity relationships, key constraints, PII handling |
| [`docs/PAGE_MAP.md`](docs/PAGE_MAP.md) | Every route, its minimum role and its purpose |
| [`docs/API_PLAN.md`](docs/API_PLAN.md) | Server actions and route handlers |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | Connector interface; LinkedIn, Lusha, Apollo, CRM |
| [`docs/SCORING.md`](docs/SCORING.md) | Scoring maths, feed algorithm, variation selection |
| [`docs/SECURITY.md`](docs/SECURITY.md) | What is implemented, **and what is still required** |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What comes next, and what never will |

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (scoring, diversification, variations) |
| `npm run db:push` / `db:migrate` / `db:deploy` | Schema management |
| `npm run db:seed` | Illustrative demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run jobs:worker` | Background job worker |
| `npm run jobs:daily-feed` | Generate today's feed for every workspace |

### Scheduling

Either run the worker (`npm run jobs:worker`, included in compose) or call the
cron endpoints with `CRON_SECRET`:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/v1/cron/daily-feed
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/v1/cron/retention-sweep
```

Feed generation is idempotent per day — re-running reuses the existing feed
unless `force` is passed.

---

## Tests

40 unit tests cover the logic that decides who gets contacted and what they are
sent: ICP fit and its geography gate, signal decay, urgency windows, opt-out
handling, angle and channel selection, priority suppression, predicate
evaluation, diversification invariants, round-robin assignment, variation
eligibility and template rendering.

```bash
npm test
```

## Status

Feature-complete against the specification and ready for production *hardening* —
not yet hardened. Read [`docs/SECURITY.md`](docs/SECURITY.md) §2 before putting
real contact data into it.

The seed data is fictional. Company and person records are composites built to
exercise the scoring and diversification logic; they contain no real personal data.
