# Integration Strategy

## Principle

Every connector runs on **the workspace's own credentials and subscription**,
through the provider's **official, documented API or supported export**. Nothing
in this codebase scrapes, automates a logged-in browser session, bypasses rate
limits or evades access controls. Connectors that could be misused are gated
behind an admin attestation recorded in `Integration.complianceAttestedBy/At`.

## Shared connector interface

`src/lib/integrations/types.ts`

```ts
interface Connector {
  provider: IntegrationProvider;
  label: string;
  capabilities: ConnectorCapability[]; // 'search' | 'enrich_person' | 'enrich_company' | 'import' | 'sync'
  compliance: ComplianceProfile;       // what it may/may not do, attestation text
  testConnection(creds): Promise<ConnectorHealth>;
  enrichPerson?(input, creds): Promise<NormalizedPerson[]>;
  enrichCompany?(input, creds): Promise<NormalizedCompany[]>;
  search?(query, creds): Promise<NormalizedPerson[]>;
  parseImport?(file): Promise<NormalizedImport>;
}
```

Adding a provider = one file implementing `Connector` + one registry entry.
Everything downstream (normalize → dedupe → upsert → provenance → scoring) is shared.

## LinkedIn — compliant paths only

| Path | Status | How it works |
|---|---|---|
| **User-provided data export** | Shipped | The user downloads their own export from LinkedIn's *Get a copy of your data* and uploads the CSV. Parsed by `linkedin.ts:parseImport`. |
| **Manual / browser-assisted entry** | Shipped | A human views a profile in their own browser and pastes the public URL plus notes. The app stores the reference URL and the human's notes — it does not fetch the page. |
| **Approved LinkedIn APIs** | Scaffolded | OAuth client for partner APIs the workspace is approved for. Disabled until `LINKEDIN_CLIENT_ID` is configured *and* an admin attests approved-partner status. |
| **CSV from LinkedIn tools** | Shipped | Exports the user is entitled to (e.g. Sales Navigator saved lists where export is permitted by their licence). |

**Never implemented:** page scraping, HTML parsing of linkedin.com, cookie/session
replay, connection-request or messaging automation, invitation throttling evasion.
Outbound LinkedIn steps always end in a human copying an **approved** draft and
sending it themselves; the app records `markSent` for tracking only.

`linkedinPublicId` / `linkedinUrl` are stored purely as a human reference.

## Lusha

- Official Lusha API, `api_key` header, workspace's own key.
- Capabilities: `enrich_person` (by name+company or email), `enrich_company`.
- Credit-aware: `config.monthlyCreditCap` and per-run caps; every call writes a
  `SourceRecord` so a repeated enrichment is a cache hit, not a second credit.
- Respects `Contact.optedOut` — suppressed contacts are never sent to the API.

## Apollo

- Official Apollo REST API (`X-Api-Key`), workspace's own key.
- Capabilities: `search` (people/organization search within the user's plan
  entitlements), `enrich_person`, `enrich_company`.
- Saved searches map to `Segment` definitions so Apollo-sourced audiences stay
  comparable to internal ones.
- Bulk endpoints are used where available to reduce rate-limit pressure; the
  client backs off on 429 with jittered exponential retry and surfaces
  `IntegrationStatus.ERROR` after `maxAttempts`.

## CRM (HubSpot / Salesforce / Dynamics)

OAuth 2.0 with refresh; two-way field mapping defined in `Integration.config.fieldMap`.
Leads push on stage change; inbound updates arrive via `/api/v1/webhooks/crm` with
HMAC verification.

## Normalization, dedupe, provenance

1. **Normalize** — provider payload → `NormalizedPerson` / `NormalizedCompany`
   (trimmed names, ISO country, `Region`, `Vertical`, persona classification by
   title keywords, size band from employee count).
2. **Dedupe** — company by normalized domain, then fuzzy name+country; person by
   `emailHash`, then LinkedIn public id, then name+accountId.
3. **Merge** — field-level precedence: human-entered > CRM > Lusha/Apollo > import;
   never overwrite a non-empty human-edited field with provider data.
4. **Provenance** — every inbound field set writes a `SourceRecord` with provider,
   external id, raw payload, consent basis and retrieval timestamp. The UI shows
   "sourced from X on date" on the contact record.

## Credential handling

Secrets are AES-256-GCM encrypted with `APP_ENCRYPTION_KEY` before they touch the
database, decrypted only inside connector calls, never serialized to a client
component, never logged. Disconnect zeroes `credentialsEnc` but keeps provenance
rows. Token refresh runs in the `enrich`/`sync` job with a re-auth prompt surfaced
on `IntegrationStatus.EXPIRED`.
