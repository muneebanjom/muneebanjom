# Scoring & Daily Recommendation Design

Scoring is **deterministic rule code**, not model output: reproducible,
explainable, auditable. AI is used for prose (explanations, drafts), never to
decide rank.

## 1. Four dimensions

| Dimension | Range | Question it answers |
|---|---|---|
| **ICP fit** | 0–100 | Is this the kind of buyer we want? |
| **Intent** | 0–100 | Is there evidence they're in market now? |
| **Urgency** | 0–100 | Is there a clock (regulatory deadline, incident, audit)? |
| **Deal potential** | 0–100 | How much is this worth if it lands? |

### ICP fit — weighted sub-scores (weights live on `IcpProfile.weights`, sum 100)

| Sub-score | Default weight | Logic |
|---|---|---|
| Geography | 20 | Exact country in ICP = full; region match = 80%; adjacent region = 40%; outside = 0 |
| Vertical | 20 | In ICP list = full; regulated adjacent = 60%; otherwise 15% |
| Persona | 25 | Persona category in ICP × seniority weight; title-keyword match adds, exclusion keywords zero it |
| Company size | 10 | Band in ICP = full; one band adjacent = 60%; employee/revenue floors gate |
| Maturity gap | 15 | Opportunity = target − current maturity, peaking at a gap of 2 levels (a gap of 4 means "no budget or no awareness yet") |
| Strategic value | 10 | `Account.strategicValue`, analyst-set (logo value, referenceability, expansion potential) |

### Intent — time-decayed signals

```
intent = clamp( Σ over signals of  weight × decay(age) × triggerAlignment , 0, 100 )
decay(age) = 0.5 ^ (ageDays / 45)        // 45-day half-life
triggerAlignment = 1.0 if the signal's trigger is in the ICP's trigger list, else 0.6
```
Plus engagement: profile/message engagement +12, prior positive reply +25,
meeting held +30; a negative reply applies −40 and an opt-out forces 0.

### Urgency
Regulatory deadline within 90 days (+35), disclosed incident in last 90 days (+30),
audit finding (+25), active RFP/tender (+30), leadership change in the persona's
function in last 120 days (+15), fiscal-year-end within 60 days (+10).

### Deal potential
Company size band (0–40) + revenue band (0–25) + regulated multiplier (×1.15) +
budget potential (0–20) + multi-angle relevance (0–15, an account needing three
of Ahad's offers is worth more than one needing one).

## 2. Priority score

```
priority = 0.40·fit + 0.25·intent + 0.20·urgency + 0.15·dealPotential
           + campaignPriorityBoost      (0–8)
           + ownerCapacityAdjustment    (−5…0, penalise overloaded owners)
           − recencyPenalty             (0–25, recommended/touched recently)
           − fatiguePenalty             (0–15, account already worked this week)
```
`recencyPenalty = 25 × 0.6^(daysSinceLastRecommended)` so a prospect surfaced
yesterday is heavily suppressed today but returns naturally after ~5 days
unless acted on.

Hard exclusions (never recommended): opted out, suppressed account, stage in
`WON | LOST | PARKED` (unless `parkedUntil` has passed), missing a usable channel,
already in an active sequence step due today, already recommended today.

## 3. Explanation

Every score produces a `breakdown: [{ dimension, label, points, rationale }]` and
a plain-English `explanation`, e.g.

> "CISO at a regulated UAE bank (1,200 staff) — squarely in your UAE Financial
> Services ICP (+82 fit). Two intent signals in the last 30 days: a SOC-modernisation
> job posting and a CBUAE compliance-deadline mention (+64 intent). Urgency is high
> because the regulatory deadline falls within 90 days (+35). Not contacted before."

## 4. Daily feed algorithm

```
1  candidates = leads eligible today (see hard exclusions)
2  rescore any lead whose score is stale (> 24h or data changed)
3  sort by priorityScore desc
4  diversify(candidates, size = 10) with caps:
       maxPerAccount = 1, maxPerVertical = 3, maxPerRegion = 5,
       maxPerPersona = 4, maxPerOwner = 4
   Greedy pass: take the highest-priority candidate whose buckets are not full;
   if fewer than `size` slots fill, relax caps in the order
   persona → vertical → region → owner → account, one level at a time, so the
   feed is always exactly 10 when the pool allows.
5  for each selected lead:
       angle   = bestOfferAngle(lead, icp)      // maturity gap × persona × triggers
       channel = bestChannel(lead)              // LinkedIn first for cold CXO in GCC
       variant = pickVariation(angle, persona, region)   // approved templates only
       reason  = renderReason(breakdown)        // top 3 contributing factors
       nba     = nextBestAction(lead)
6  persist DailyFeed + 10 Recommendation rows (unique per feedDate+lead)
7  assign round-robin across active reps respecting per-owner caps
```

### Variation selection (AC4)
`pickVariation` filters approved, active templates matching angle + kind +
persona + region, then samples **weighted by observed reply rate with Laplace
smoothing** (`(replies + 1) / (timesUsed + 2)`) and an ε = 0.2 exploration floor,
so proven templates win more often but new ones still get tested. Randomization
is seeded by `feedDate + leadId`, making a day's feed reproducible.

### Learning loop
`RecommendationHistory` records accept/dismiss/snooze with feedback and outcome.
Analytics surfaces acceptance rate and downstream reply/meeting rate per
region · vertical · persona · angle · template, which is what the operator uses
to retune ICP weights and scoring rules. Weight retuning is deliberately
human-in-the-loop in v1 — auto-tuning is on the roadmap behind an explicit toggle.
