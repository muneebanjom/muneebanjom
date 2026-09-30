# Security & Privacy Notes

This document states what is implemented, and what still has to be done before
this handles real contact data in production. It is deliberately explicit about
the second list.

## 1. Implemented

### Authentication & sessions
- Passwords hashed with bcrypt (cost 12). Sign-in does constant-ish work whether
  or not the user exists, to avoid account enumeration.
- Sessions are HS256 JWTs in an `HttpOnly`, `SameSite=Lax`, `Secure` (in
  production) cookie, expiring after 12 hours.
- Deactivated users cannot sign in; an admin cannot deactivate themselves.

### Authorization
- Six roles (`OWNER`, `ADMIN`, `MANAGER`, `REP`, `ANALYST`, `VIEWER`) against an
  explicit permission matrix in `src/lib/rbac.ts`. Permissions are allow-lists,
  so a new role grants nothing until listed.
- Every server action calls `requireSession()` then `assertPermission()` before
  touching data. Navigation hides what a role cannot use, but the check is
  server-side — hiding a control is not the control.
- **Separation of duties**: when `requireApprovalBeforeSend` is on, a draft's
  author cannot approve it. Editing an approved draft withdraws approval,
  because approval applies to the content that was actually read.

### Tenant isolation
- Every tenant row carries `workspaceId`; all queries filter on it.
- Mutations re-fetch the target and call `assertSameWorkspace()`, so an id
  guessed from another tenant fails closed rather than silently succeeding.
- Assignment actions verify the target user is a member of the same workspace
  before writing, so a tampered form cannot assign work across tenants.

### Data protection
- Contact email and phone are encrypted at rest with AES-256-GCM
  (`APP_ENCRYPTION_KEY`). Integration credentials use the same envelope.
- `emailHash` is an HMAC-SHA256 used for deduplication and lookup, so dedupe
  never requires decrypting PII.
- Users without `pii:read` see masked values (`la••••••@bank.example`).
- The AI layer receives a redacted `ProspectContext` — no email, phone, or raw
  provider payload ever leaves the process.
- Audit payloads pass through `redact()`, which masks any key matching
  email/phone/password/credential/token/secret and truncates long strings.
- Credentials are decrypted only inside a connector call, never returned to a
  client component and never logged.
- Production boot fails if `AUTH_SECRET` is still the development default or
  `APP_ENCRYPTION_KEY` is missing.

### Compliance controls
- Connectors declare permitted and prohibited uses, rendered verbatim in the UI.
  A connector cannot store or use credentials until an admin attests compliance;
  `loadCredentials()` returns `null` for an un-attested integration, so the gate
  cannot be bypassed by a direct call.
- Opt-out is honoured everywhere: opted-out contacts are excluded from the feed,
  from drafting, from approval, from sending and from enrichment requests.
  A reply classified as an opt-out suppresses the contact and archives every
  pending draft in the same transaction.
- `SourceRecord` retains provenance (source, external id, lawful basis,
  timestamp) for every inbound field set. The retention sweep purges raw payloads
  after `Workspace.dataRetentionDays`.
- Audit events cover authentication, role changes, integration connect and
  disconnect, attestation, approvals, sends, opt-outs and exports. Privileged
  actions are marked `critical`.

### Application hardening
- All input validated with Zod at the action boundary; invalid input is rejected
  rather than coerced.
- Scoring rule predicates resolve through a **whitelist** of field paths — a rule
  cannot reach arbitrary object internals, and an unknown field fails closed.
- No `dangerouslySetInnerHTML` anywhere; React escapes all rendered content.
- Security headers set in `next.config.mjs` (`X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, restrictive `Permissions-Policy`).
- Connector HTTP has timeouts, bounded retries and jittered backoff, so a
  provider outage cannot hang a worker.
- Cron endpoints require `CRON_SECRET` and are disabled (503) when it is unset,
  rather than being left open.

## 2. Required before production

These are deliberate gaps, not oversights:

1. **Postgres row-level security.** Application-level scoping is enforced
   everywhere, but RLS keyed on `app.workspace_id` would make a missed filter
   fail closed at the database. Recommended before multi-tenant production use.
2. **Rate limiting.** Add per-IP limits on sign-in and per-user limits on
   generation-heavy actions (draft generation, enrichment, feed regeneration).
   Sign-in throttling in particular is not implemented.
3. **CSRF.** Next.js Server Actions carry origin checks, but add an explicit
   `Origin`/`Referer` check on the `/api/v1` mutating routes if you expose them.
4. **Secrets management.** `APP_ENCRYPTION_KEY` currently comes from the
   environment. Move to a KMS or secrets manager with key rotation, and add a key
   version to the ciphertext envelope (the `v1.` prefix is already there for it).
5. **Password policy and MFA.** No complexity rules, no rotation, no second
   factor, no lockout. Add these, or replace the auth module with your IdP —
   it is isolated in `src/lib/auth.ts` precisely so it can be swapped.
6. **Email delivery.** Member invitations currently return a temporary password
   for the admin to pass on out of band. Wire up a mail provider and a signed,
   expiring invitation link.
7. **Backups and DR.** Automate database backups, test restores, and document an
   RPO/RTO.
8. **Dependency and image scanning** in CI, plus a vulnerability disclosure path.
9. **Log hygiene review.** Application logs avoid PII by construction; confirm
   your platform's request logs do the same before enabling verbose logging.

## 3. Threat model notes

| Threat | Mitigation |
|---|---|
| Cross-tenant data access via guessed ids | `workspaceId` filter + `assertSameWorkspace()` on every mutation; RLS recommended |
| Stolen database backup | PII and credentials encrypted with a key held outside the database |
| Malicious or careless insider | RBAC, separation of duties on approvals, critical-severity audit trail, exportable |
| Credential leakage through the UI or logs | Credentials never serialized to client components; audit redaction; masked display |
| Prompt injection via imported contact data | AI output is prose only — it never decides ranking, permissions or sends. Scoring is deterministic rule code. |
| Compliance breach via a connector | Attestation gate, declared prohibitions, no scraping or automation code paths exist to misuse |
| Contacting someone who opted out | Enforced at feed generation, drafting, approval, sending and enrichment |

## 4. Reporting

Security issues should go to the workspace owner and the engineering lead before
any public disclosure.
