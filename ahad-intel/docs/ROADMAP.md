# Roadmap

## Now — production hardening (weeks 1–4)

Everything in `docs/SECURITY.md` §2 is the first block of work. In priority order:

1. Postgres row-level security keyed on `app.workspace_id`.
2. Rate limiting on sign-in and on generation-heavy actions.
3. Secrets manager with key rotation (the ciphertext envelope is already versioned).
4. MFA, password policy and lockout — or swap `src/lib/auth.ts` for your IdP.
5. Email delivery for invitations, with signed expiring links.
6. Backups, restore drills, CI dependency and image scanning.

## Next — sharpening the recommendation quality (weeks 4–10)

- **Signal ingestion.** The intent score is only as good as the signals feeding
  it. Add connectors for public tender portals, regulator publication feeds,
  job-posting sources and press releases in the GCC — each becomes a `Signal`
  row with a trigger and a weight, and the existing decay maths handles the rest.
- **Outcome-weighted scoring.** `RecommendationHistory` already records accept,
  dismiss and downstream outcomes. Fit a simple logistic model on it and surface
  *suggested* weight changes for a human to accept. Keep the deterministic
  engine as the system of record — the proposal is advisory, and auto-tuning
  ships behind an explicit toggle.
- **Account-level recommendations.** Today the feed is person-level. Add a
  buying-committee view: which three people at one account to work in sequence,
  and in what order.
- **Look-alike expansion.** From won and qualified accounts, suggest similar
  firms in the same market that are not yet in the pool.
- **Feed calibration.** Show the operator how today's feed differs from
  yesterday's, and why a lead dropped out.

## Then — workflow depth (weeks 10–20)

- **Sequences in the UI.** `OutreachSequence` is modelled and stored; give it a
  builder and a due-step view so multi-touch cadences are visible in the feed.
- **Two-way CRM sync.** The connector scaffold and webhook endpoint exist;
  finish HubSpot and Salesforce field mapping, conflict resolution and backfill.
- **Arabic-language generation.** `locale` is plumbed through templates, drafts
  and the AI contract. Add Arabic templates and a bilingual review flow, with a
  native-speaker approval step before anything is marked approved.
- **Mobile feed.** The daily ten is a phone-sized job; the layout is responsive
  but a focused mobile view for accept/snooze/dismiss would suit field sales.
- **Meeting outcomes into scoring.** Feed qualification notes and meeting
  outcomes back into deal-potential scoring.

## Later — platform

- **Multi-workspace switching** for consultants covering several entities.
- **Public API and webhooks** beyond the current read endpoints, with scoped
  service tokens (the `x-api-key` path is specified in `docs/API_PLAN.md`).
- **Warehouse export** (BigQuery/Snowflake) for analysts who want their own cuts.
- **Approved LinkedIn partner integration**, if and when Ahad's application is
  approved for the relevant endpoints. The connector is scaffolded and inert;
  it requires both configured credentials and an admin attestation to activate.
- **Team performance analytics** — per-rep acceptance, reply and meeting rates,
  used for coaching rather than surveillance.

## Explicitly not planned

These are not backlog items. They are out of scope permanently:

- Any form of scraping, headless-browser harvesting or session replay.
- Unattended sending on LinkedIn or any platform that prohibits automation.
- Removing the human approval gate before outreach.
- Cross-tenant pooling, sharing or resale of contact data.
