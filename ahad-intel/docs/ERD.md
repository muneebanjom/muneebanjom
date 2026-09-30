# Entity Relationship Diagram (text)

Legend: `1—*` one-to-many, `*—*` many-to-many via join, `?` optional FK.

```
Workspace (tenant root)
 ├─1—*─ Membership ─*—1─ User
 ├─1—*─ Team ─1—*─ Membership
 ├─1—*─ IcpProfile
 ├─1—*─ Persona
 ├─1—*─ ScoringRule
 ├─1—*─ Account
 ├─1—*─ Contact
 ├─1—*─ Lead
 ├─1—*─ Campaign ──? IcpProfile, ? Team
 ├─1—*─ Segment ──? IcpProfile
 ├─1—*─ OutreachSequence ──? Campaign
 ├─1—*─ MessageTemplate ──? Campaign, ? Persona
 ├─1—*─ DraftMessage
 ├─1—*─ QualificationScore
 ├─1—*─ DailyFeed ─1—*─ Recommendation
 ├─1—*─ ActivityLog / Note / Task / Reply / Meeting
 ├─1—*─ Integration ─1—*─ SourceRecord
 ├─1—*─ Tag ─1—*─ TagAssignment
 ├─1—*─ AuditEvent
 └─1—*─ JobRun

Account 1—* Contact          (a company has many people)
Account 1—* Lead
Account 1—* Signal
Contact *—1 Persona?         (classified persona)
Contact 1—* Lead             (same person may be worked in several campaigns)

Lead  *—1 Contact
Lead  *—1 Account
Lead  *—1 Campaign?
Lead  *—1 User? (owner)
Lead  1—* QualificationScore   (immutable score history)
Lead  1—* Recommendation       (max one per feedDate — unique)
Lead  1—* DraftMessage 1—* Reply
Lead  1—* Task / Note / Meeting / ActivityLog / Signal
Lead  *—* Tag via TagAssignment

Recommendation *—1 DailyFeed?
Recommendation *—1 User? (assignee)
Recommendation 1—* RecommendationHistory   (status transitions + outcome = learning signal)
Recommendation 1—* DraftMessage

DraftMessage *—1 MessageTemplate?   (which variation was used → template performance)
MessageTemplate.variantKey groups A/B variants of the same angle+kind.

SourceRecord *—1 Integration?   (provenance: which connector, which external id, raw payload)
SourceRecord *—1 Account? / Contact?
```

## Key constraints

| Constraint | Purpose |
|---|---|
| `Account @@unique([workspaceId, domain])` | Company dedupe key |
| `Contact @@unique([workspaceId, emailHash])` | Person dedupe without decrypting PII |
| `Lead @@unique([workspaceId, contactId, campaignId])` | One lead per person per campaign |
| `Recommendation @@unique([workspaceId, feedDate, leadId])` | A prospect appears at most once per day |
| `DailyFeed @@unique([workspaceId, feedDate])` | One feed per workspace per day (idempotent generation) |
| `SourceRecord @@unique([workspaceId, provider, externalId])` | Idempotent re-import |
| `Integration @@unique([workspaceId, provider, label])` | Multiple accounts per provider, distinctly labelled |

## PII handling

`Contact.emailEnc` / `phoneEnc` hold AES-256-GCM ciphertext; `emailHash` is an
HMAC-SHA256 of the normalized email used for dedupe and lookup. Raw connector
payloads live in `SourceRecord.payload` and are purged by the retention sweep
after `Workspace.dataRetentionDays`.
