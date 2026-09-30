# API / Server-Action Plan

Writes are Server Actions (co-located `actions.ts`); machine-facing endpoints are
route handlers under `/api/v1`. Every entry: auth → permission → Zod validation →
tenant-scoped write → audit → revalidate.

## Server actions

### ICP & configuration — `app/(app)/icp/actions.ts`
| Action | Permission | Notes |
|---|---|---|
| `saveIcpProfile(input)` | `icp:write` | Validates weights sum to 100 |
| `setDefaultIcp(id)` | `icp:write` | Single default per workspace |
| `savePersona(input)` | `settings:write` | Title keywords, pain points, angles |
| `saveScoringRule(input)` | `settings:write` | Validates predicate shape |
| `previewIcpImpact(id)` | `icp:read` | Dry-run scoring over the pool, no writes |

### Leads & accounts — `app/(app)/leads/actions.ts`
`createLead`, `updateLeadStage`, `assignLead`, `bulkAssign`, `bulkTag`,
`addNote`, `createTask`, `completeTask`, `suppressAccount`, `saveSegment`,
`rescoreLead`, `rescoreWorkspace`.

### Feed — `app/(app)/feed/actions.ts`
| Action | Permission | Notes |
|---|---|---|
| `generateTodaysFeed(opts)` | `feed:generate` | Idempotent per `feedDate`; `force` regenerates |
| `setRecommendationStatus(id, status, feedback)` | `feed:act` | Writes `RecommendationHistory` |
| `assignRecommendation(id, userId)` | `feed:assign` | |
| `overrideFeedSlot(leadId, rank)` | `feed:generate` | Manual override, flagged `isManualOverride` |
| `generateDraftFromRecommendation(id, opts)` | `draft:write` | Creates `DraftMessage` + alternates |

### Outreach — `app/(app)/drafts/actions.ts`
`generateDraft`, `updateDraft`, `submitForApproval`, `approveDraft`,
`rejectDraft`, `markSent`, `saveTemplate`, `approveTemplate`, `archiveDraft`.
`markSent` records the human-performed send; the platform never sends on
LinkedIn itself.

### Inbox — `app/(app)/inbox/actions.ts`
`logReply` (with AI summary/sentiment/signals/objections), `markHandled`,
`advanceStage`, `bookMeeting`, `updateMeetingOutcome`.

### Integrations — `app/(app)/integrations/actions.ts`
| Action | Permission | Notes |
|---|---|---|
| `attestCompliance(provider, label)` | `integration:write` | Required before connect |
| `connectIntegration(input)` | `integration:write` | Encrypts credentials, never echoes them |
| `testIntegration(id)` | `integration:write` | Live credential check |
| `disconnectIntegration(id)` | `integration:write` | Zeroes secrets, keeps provenance |
| `importCsv(batch)` | `import:write` | Normalize → dedupe → upsert → `SourceRecord` |
| `importLinkedInExport(batch)` | `import:write` | User-provided export only |
| `enrichSelection(ids, provider)` | `enrich:run` | Queues `enrich` jobs against user's own subscription |

### Admin — `app/(app)/settings/actions.ts`
`updateWorkspace`, `inviteMember`, `changeMemberRole`, `deactivateMember`,
`updateRetention`, `exportAuditLog`, `purgeContact` (right-to-erasure).

## Route handlers

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness + DB check |
| `POST` | `/api/v1/cron/daily-feed` | `CRON_SECRET` | Generate feeds for all active workspaces |
| `POST` | `/api/v1/cron/retention-sweep` | `CRON_SECRET` | Purge expired raw payloads |
| `POST` | `/api/v1/import/csv` | session `import:write` | Multipart CSV ingest |
| `GET` | `/api/v1/leads` | session or API key | Paginated, filterable lead list |
| `GET` | `/api/v1/feed/today` | session or API key | Today's recommendations (JSON) |
| `POST` | `/api/v1/webhooks/crm` | HMAC signature | Inbound CRM updates |
| `GET` | `/api/v1/export/audit` | `audit:read` | CSV export of audit events |

## Conventions

- All inputs validated with Zod; invalid input returns a typed `ActionResult`
  (`{ ok: false, error, fieldErrors }`) rather than throwing to the client.
- Rate limits on generation-heavy actions (draft generation, enrichment) per user.
- No PII in URLs, logs or error messages.
