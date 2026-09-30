# Ahad Customer Intelligence & Outreach Platform — Product Spec

## 1. Problem

Ahad sells cybersecurity, GRC/compliance, advanced cyber defense, digital
transformation, AI governance & implementation, enterprise risk reduction and
security modernization into UAE, Saudi Arabia, the wider GCC and MENA.

The bottleneck is not "more contacts". It is deciding, every morning, **which ten
decision-makers are worth a personal message today, and what to say to them.**

## 2. Product statement

A customer-intelligence and outreach platform that turns a compliant pool of
accounts and contacts into a ranked, explained, daily list of ten prospects —
each with a reason, a scored justification, an offer angle, a channel and a
human-approved draft.

It is explicitly **not** a scraper and **not** an auto-sender. Every outbound
message passes a human approval gate.

## 3. Primary users

| User | Role | Job to be done |
|---|---|---|
| Sales lead / CRO | `OWNER`/`MANAGER` | Decide where the team spends the week; see which regions, verticals and angles convert |
| Account executive | `REP` | Work "Today's Top 10", approve/edit drafts, log replies, book meetings |
| Sales analyst | `ANALYST` | Import and enrich data, tune ICP and scoring rules, curate accounts |
| Ops / IT admin | `ADMIN` | Connect Lusha/Apollo/CRM under the company's own subscriptions, manage users, review audit log |

## 4. Outcomes the product must deliver

1. A ranked **Daily Priority Feed** of exactly 10 prospects, refreshed daily, diversified across region/vertical/persona/account.
2. Every recommendation carries **why** (plain-English reason + score breakdown), **what to say** (offer angle + message variation) and **what to do next**.
3. Configurable **ICP** and **scoring rules**, so the definition of "good" is owned by Ahad, not hard-coded.
4. Compliant **ingestion** from manual entry, CSV/spreadsheet, user-provided LinkedIn exports or approved LinkedIn APIs, Lusha, Apollo and CRM.
5. **Personalized outreach drafting** with multiple approved variations per angle and tone, always human-approved before sending.
6. **Conversation tracking** through a 12-stage lifecycle to opportunity/won/lost.
7. **Analytics** that answer: which geographies, verticals, personas, angles and templates actually produce conversations.
8. **Governance**: RBAC, audit log, encrypted secrets and PII, retention policy, opt-out honoured everywhere.

## 5. Scope boundaries (compliance)

**In scope**
- Officially supported provider APIs used with the *workspace's own* credentials and subscription (Lusha, Apollo, CRM, LinkedIn where an approved API/partnership exists).
- User-provided data: manual entry, CSV, spreadsheet, LinkedIn data exports the user is entitled to download, notes from browser-assisted research a human performed.
- Drafting messages for a human to review, edit, approve and send.

**Explicitly out of scope — the product must never do this**
- Scraping LinkedIn or any site, headless-browser harvesting, bypassing rate limits, login walls, CAPTCHAs or robots directives.
- Unattended sending on LinkedIn or any platform that prohibits automation.
- Sharing, reselling or cross-tenant pooling of contact data.
- Storing credentials in plaintext or in the browser.

Connectors are gated behind an explicit **compliance attestation** (`Integration.complianceAttestedBy/At`): an admin confirms the credentials are the workspace's own and that usage is within the provider's terms before the connector can be enabled.

## 6. Configuration surface

- **Geography**: `UAE, KSA, GCC, MENA, LEVANT, NORTH_AFRICA, EUROPE, NORTH_AMERICA, APAC, OTHER`, plus free-form ISO country lists for custom regions.
- **Verticals**: financial services, healthcare, government, energy, telecom, logistics, real estate, manufacturing, retail, technology, education, hospitality, professional services, custom.
- **Company size bands**: MICRO / SMALL / MID / LARGE / ENTERPRISE, plus explicit employee and revenue floors.
- **Personas**: CEO, CIO, CTO, CISO, Head of GRC, Compliance Officer, Risk Officer, IT Director, Digital Transformation Director, Data/AI leader, Procurement — each with title keywords, pain points, default angles and qualification questions.
- **Buying triggers**: compliance pressure, security incident, cloud modernization, digital transformation, AI adoption, governance requirement, regulatory change, enterprise risk, leadership change, funding/expansion, audit finding, vendor consolidation.
- **Maturity axes**: compliance, security, transformation, AI readiness — the *gap* between an account's maturity and the ICP target is the opportunity signal.

## 7. Functional acceptance criteria

| # | Criterion | Where it is satisfied |
|---|---|---|
| AC1 | Generates a daily top-10 recommended customer feed | `src/lib/recommendations/engine.ts`, `/app/(app)/feed` |
| AC2 | Each recommendation has reason, scores and suggested message angle | `Recommendation.reason/reasonBullets/suggestedAngle` |
| AC3 | Recommendations diversify across regions and verticals | `diversify()` with per-bucket caps |
| AC4 | Randomizes among **approved** messaging variations | `pickVariation()` — approved templates only, weighted by performance |
| AC5 | Team can filter, assign and act on the feed | Feed filters + assign/accept/snooze/dismiss server actions |
| AC6 | Dashboards show which recommendations and message types perform best | `/app/(app)/analytics` |
| AC7 | Compliant LinkedIn-related, Lusha and Apollo integrations | `src/lib/integrations/*` with attestation gate |
| AC8 | Secure, maintainable, production-hardening-ready | RBAC, audit, encryption, tenancy guard, Docker |

## 8. Non-goals for v1

Auto-send on any platform; email deliverability infrastructure; contract/quote
generation; multi-language message generation beyond `locale` plumbing (English
and Arabic templates are seeded, generation is English-first).
