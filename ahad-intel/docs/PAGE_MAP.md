# Page Map

| # | Route | Page | Min role | Purpose |
|---|---|---|---|---|
| 1 | `/login` | Sign in | — | Credentials sign-in; onboarding link |
| 1b | `/onboarding` | Workspace setup | OWNER | Name workspace, pick regions/verticals/personas, seed default ICP |
| 2 | `/` | Workspace overview | VIEWER | KPI strip, today's feed preview, pipeline, alerts, next actions |
| 3 | `/icp` | ICP builder | ANALYST | Define/refine ICP; live recommendation of verticals/personas to prioritize |
| 4 | `/feed` | Daily Priority Feed | VIEWER (act: REP) | Today's Top 10 with reasons, scores, angles, assignment |
| 5 | `/leads` | Leads & accounts | VIEWER | Table with fast filters, saved views, bulk actions |
| 5b | `/accounts/[id]` | Account detail | VIEWER | Firmographics, maturity, signals, people, leads |
| 6 | `/leads/[id]` | Lead detail | VIEWER | Score explanation, timeline, drafts, replies, tasks, next action |
| 7 | `/campaigns` | Campaigns | MANAGER | Create/segment campaigns by region, vertical, persona, angle |
| 7b | `/campaigns/[id]` | Campaign detail | MANAGER | Membership, sequence, template set, performance |
| 8 | `/drafts` | Outreach drafts | REP | Approval queue: draft → pending → approved → sent |
| 9 | `/inbox` | Inbox & replies | REP | Logged replies, sentiment, buying signals, objections, next action |
| 10 | `/analytics` | Analytics | MANAGER | 18 charts across geography, vertical, persona, angle, template, funnel |
| 11 | `/integrations` | Integrations | ADMIN | Connect Lusha/Apollo/CRM, CSV & LinkedIn export import, attestation |
| 12 | `/settings` | Settings & admin | ADMIN | Workspace, personas, scoring rules, templates, members, retention |
| 13 | `/audit` | Audit log | ADMIN | Filterable, exportable audit trail |

## Shell

`(app)` route group renders the authenticated shell: left nav (grouped Work /
Intelligence / Configure), workspace switcher, global search, user menu.
`/login` and `/onboarding` sit outside the shell.

## Key interactions

- **Feed card**: rank badge · priority ring · why-bullets · angle chip · channel chip ·
  "Generate draft" · assign · accept / snooze / dismiss (each writes `RecommendationHistory`).
- **Score explainer**: hover/expand on any score shows the contributing rules with
  points and plain-English rationale — no black box.
- **Saved views**: `Segment.definition` JSON persists filter state; pinned views appear in the nav.
- **Approval gate**: send controls stay disabled until `DraftStatus = APPROVED`, and
  approval requires a different user than the author when
  `Workspace.requireApprovalBeforeSend` is on.
