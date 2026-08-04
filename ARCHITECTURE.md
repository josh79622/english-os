# Architecture — English OS

> Version 1.1 · all blocking decisions resolved 2026-08-04 (see Decision Log).
>
> This document owns **structures and algorithms**. Principles live in
> [CONSTITUTION.md](CONSTITUTION.md); the locked AI interfaces in
> [CONTRACTS.md](CONTRACTS.md); health thresholds in
> [MAINTENANCE_RULES.md](MAINTENANCE_RULES.md); workflow in
> [CONTRIBUTING.md](CONTRIBUTING.md). No content is duplicated between them.

---

# Roles & The Information Loop

## Roles

### ChatGPT Voice — English Coach

- Holds realistic conversations.
- Simulates Australian English.
- Pushes fluency over perfection.
- Introduces new vocabulary naturally.
- **Grades review items encountered during the session.**
- Produces a structured Session Report.

ChatGPT never edits the repository.

### Claude Code — Knowledge Engineer & Repository Maintainer

- Converts Session Reports into structured knowledge.
- Maintains the repository, refactors, removes duplication.
- Runs the scheduler and produces the Daily Briefing.
- Commits and pushes.

Claude owns the repository.

### GitHub — Source of Truth

Neither AI relies on conversational memory. Every fact the system
depends on lives in the repo.

## The Loop

v1.0 left a gap: ChatGPT Voice cannot read the repository, yet it is
responsible for natural review. The loop is closed with two explicit
artifacts, **Daily Briefing** (in) and **Session Report** (out):

```
                  ┌──────────────────────────────┐
                  │        GitHub (truth)        │
                  └──────┬────────────────▲──────┘
                         │                │
        DAILY_BRIEFING.md│                │Session Report
        (learner pastes  │                │(learner pastes
         into ChatGPT)   │                │ into Claude)
                         ▼                │
                  ┌──────────────────────────────┐
                  │      ChatGPT Voice session    │
                  └──────────────────────────────┘
```

The learner is the transport layer. Both artifacts are plain text,
copy-paste sized, and format-locked.

---

# Data Model

## Storage Decision

**Item files are the single source of truth.** One knowledge item = one
Markdown file with YAML frontmatter. Everything else (indexes, briefings,
stats) is *derived* and regenerable.

Rationale: git-diffable, independently editable, no merge conflicts,
survives any tooling change. The token cost of many small files is
managed by never loading them all — the index and scheduler select the
few that matter.

## Repository Layout

```
/
├── README.md                   # entry point for humans
├── ARCHITECTURE.md             # structures, algorithms, decisions
├── CONSTITUTION.md             # non-negotiable principles
├── CONTRACTS.md                # the two locked AI interfaces
├── MAINTENANCE_RULES.md        # health thresholds, refactor triggers
├── CONTRIBUTING.md             # how Claude/humans modify the repo
│
├── knowledge/
│   ├── INDEX.md                # generated: full item catalogue
│   └── items/
│       ├── vocab/              # vocab-<slug>.md
│       ├── expression/
│       ├── grammar/
│       ├── pattern/            # conversation patterns
│       ├── mistake/            # recurring personal errors
│       ├── scenario/           # situational knowledge
│       └── strategy/           # learning strategies
│
├── sessions/
│   └── 2026/2026-08-04-01.md   # immutable raw Session Reports
│
├── state/                      # all derived; safe to delete and rebuild
│   ├── index.json              # id → scheduling fields
│   ├── metrics.json            # time series, appended per session
│   └── pending-corrections.json # corrections seen once, awaiting a second
│
├── briefings/
│   └── DAILY_BRIEFING.md       # regenerated each session
│
├── src/
│   ├── cli.ts                  # single entry point: `npm run <cmd>`
│   ├── types.ts                # schema types, shared vocabulary
│   ├── item.ts                 # item files: parse / serialise / load / save
│   ├── ingest.ts               # validate + apply a Session Report
│   ├── schedule.ts             # grade → next_review (the ONLY scheduler)
│   ├── briefing.ts             # select due items, render briefing
│   ├── indexer.ts              # rebuild INDEX.md + state/index.json
│   ├── health.ts               # check thresholds, report violations
│   └── util.ts                 # paths, dates, seeded randomness
│
├── package.json
└── tsconfig.json
```

## Item Schema

```yaml
---
id: vocab-knock-off              # stable, immutable, = filename stem
type: vocab                      # vocab|expression|grammar|pattern|
                                 # mistake|scenario|strategy
title: knock off                 # display form
domain: [work, social]           # learning domains (see Learning Domains)
scenario: workplace              # primary situational context
tags: [slang, au]

# --- lifecycle ---
first_seen: 2026-08-04
last_seen: 2026-08-04

# --- scheduling (owned by src/schedule.ts, never hand-edited) ---
interval: 2                      # days until next review
ease: 2.0                        # multiplier, clamped [1.3, 2.8]
last_review: null
next_review: 2026-08-06
review_history:                  # append-only
  - {date: 2026-08-04, grade: 3, session: 2026-08-04-01}

# --- derived (recomputed, never hand-edited) ---
mastery_score: 0.0               # 0.0–1.0
status: new                      # new|learning|familiar|mastered
difficulty: medium               # easy|medium|hard, from failure rate
frequency: 1                     # times encountered in sessions
---

## Meaning
To finish work for the day.

## Usage
> "I knock off at five."

## Notes
Very common in Australian workplaces. Also "knock-off drinks" =
after-work drinks.

## Related
- [[expression-arvo]]
- [[scenario-workplace]]
```

### Schema decisions (changed from v1.0)

| v1.0 | v1.1 | Why |
|---|---|---|
| no `id` | `id` required, immutable | `review_history` and cross-links need stable references |
| `status`, `mastery_score`, `confidence` all authoritative | `mastery_score` is authoritative; `status` derived; `confidence` **removed** | Three overlapping fields will contradict each other |
| `difficulty` hand-set | derived from failure rate | Self-reported difficulty is noise |
| no `interval`/`ease` | added | The scheduler needs state to be deterministic |

Claude may extend the schema, but must keep it backward compatible and
must add a migration note to `MAINTENANCE_RULES.md`.

### Derived field formulas

```
mastery_score := 0.7 * mastery_score + 0.3 * (grade / 3)     # on review
                 0.0                                          # on creation

status := mastered  if mastery_score >= 0.80 and interval >= 32
          familiar  if mastery_score >= 0.55
          learning  if review count >= 1
          new       otherwise

difficulty := hard    if fail_rate > 0.40      # fail = grade <= 1
              easy    if fail_rate < 0.10 and review count >= 3
              medium  otherwise
```

## Session Record Schema

Sessions are **immutable**. Never edited, never deleted, never copied
into knowledge files. A session file is the raw Session Report plus an
ingestion footer written once by `ingest.ts`:

```
Ingested: 2026-08-04T21:30
Items created: vocab-knock-off, expression-arvo
Items updated: grammar-present-perfect (grade 2)
```

---

# The Two Contracts

The Session Report (coach → engineer) and the Daily Briefing
(engineer → coach) are the only interfaces between the two AIs, and the
only way the loop closes. Both formats are locked and specified in
**[CONTRACTS.md](CONTRACTS.md)**.


# Review Engine

## Principles (unchanged from v1.0)

Review happens naturally. Never interrupt conversation to quiz the
learner. Reintroduce vocabulary, reuse grammar patterns, revisit
expressions, build realistic scenarios. The learner should often be
unaware review is happening. **Conversation is the review mechanism.**

## Scheduling — Deterministic, Not Judgment

**The LLM never picks dates.** ChatGPT emits a grade; `schedule.ts`
computes the schedule. This is what makes "knowledge and review strategy
remain independent" real rather than aspirational.

```ts
// src/schedule.ts — default strategy: "ladder-ease"
const EASE_MIN = 1.3, EASE_MAX = 2.8;
const INTERVAL_MAX = 180;
export const INTERVAL_FIRST = 2, EASE_FIRST = 2.0;

export function applyGrade(item: Item, grade: Grade, today: IsoDate): Item {
  let { ease, interval } = item;

  switch (grade) {
    case 0:                       // cannot recall → restart
      ease -= 0.20; interval = 1; break;
    case 1:                       // significant hesitation → shorten
      ease -= 0.15; interval = Math.max(1, Math.round(interval * 0.5)); break;
    case 2:                       // minor hesitation → small increase
      ease -= 0.05;
      interval = Math.max(1, Math.round(interval * ease * 0.8)); break;
    case 3:                       // immediate → full increase
      ease += 0.05; interval = Math.round(interval * ease); break;
  }

  item.ease       = clamp(ease, EASE_MIN, EASE_MAX);
  item.interval   = Math.min(interval, INTERVAL_MAX);
  item.lastReview = today;
  item.nextReview = addDays(today, item.interval);
  item.reviewHistory.push({ date: today, grade, session });
  return recomputeDerived(item);
}
```

New items start at `interval = 2`, `ease = 2.0`. **With every grade at
3, this reproduces the v1.0 ladder exactly: 2, 4, 8, 16, 32, 64, 128.**
The default strategy is therefore a strict superset of v1.0 — adaptive
where v1.0 was fixed, identical where it wasn't.

## Strategy Independence

`schedule.ts` must expose exactly one entry point:

```ts
applyGrade(item: Item, grade: Grade, today: IsoDate): Item
```

Swapping to SM-2, FSRS, or anything future means replacing that one
file. No knowledge file changes. No schema changes beyond additive
strategy-private fields (namespaced, e.g. `fsrs_stability`).

---

# Learning Domains

v1.0 never stated *what* the learner is trying to be able to do, so
vocabulary would grow in random directions and "new item" selection
would have no priority signal.

**Ranking (decided 2026-08-04): workplace-first.**

| Priority | Domain | Description |
|---|---|---|
| 1 | `work` | Meetings, status updates, disagreement, negotiation |
| 2 | `social` | Small talk, humour, slang, building rapport |
| 3 | `daily` | Shops, pharmacy, transport, appointments |
| 4 | `service` | Complaints, requests, phone calls, bureaucracy |

Every item carries at least one `domain`. New-item selection draws from
the highest-priority domain that is under-represented. Domains can be
re-ranked at any time; that changes future selection only, never
existing knowledge.

Scenario suggestions in the Daily Briefing are drawn from the top-ranked
domain roughly 50% of the time, with the remainder spread across the
others — a single domain must not starve the rest.

## Session Cadence

**Target: 3–4 sessions per week (decided 2026-08-04).**

The default scheduler is tuned for this rate: at 3–4 sessions/week,
3 review items per session clears roughly 12 items/week, which matches
the due-rate of a knowledge base growing at ~8 new items/week once the
ladder spreads out.

Cadence is the calibration constant for two things:

- **H6 backlog threshold** (see MAINTENANCE_RULES.md) assumes this rate. Dropping to
  1–2 sessions/week requires raising `INTERVAL_FIRST` or reviewing more
  items per session; raising to daily allows more new items per session.
- **Metric interpretation** (see Metrics) — all rolling windows are
  7-day, i.e. ~3–4 data points.

If actual cadence diverges from target for 3+ consecutive weeks, that
is a health signal: report it and re-tune rather than letting backlog
grow silently.

---

# Metrics

Without measurement there is no way to know the system works.
`state/metrics.json` is appended on every ingest; `npm run stats` renders
the current picture.

Tracked:

- **Mastery distribution** — item counts per `status` over time. The
  system works if mass moves rightward.
- **Review success rate** — 7-day rolling mean grade. Healthy range
  2.0–2.6. Above 2.6 means intervals are too short; below 2.0 means the
  learner is drowning.
- **Mistake recurrence** — `frequency` on `mistake` items. Should fall.
  A rising mistake item is the single most actionable signal.
- **Throughput** — new items per week vs items reaching `mastered`.
  Creation must not outrun consolidation.
- **Session cadence** — sessions per week; drives H6 interpretation.

---

# Decision Log

Resolved 2026-08-04:

| # | Decision | Outcome |
|---|---|---|
| 1 | Learning domains | Workplace-first: `work` › `social` › `daily` › `service` (see Learning Domains) |
| 2 | Session cadence | 3–4 sessions/week; scheduler and H6 tuned to this rate |
| 3 | Implementation language | TypeScript on Node, `src/`, one CLI entry point |
| 4 | Repository hosting | `github.com/josh79622/english-os`, private |

Open, non-blocking — revisit when the data justifies it:

5. **FSRS migration** — once ~50 items have ≥5 reviews each. Until then
   there is not enough signal to beat the default strategy.
6. **Accelerated `mistake` schedule** — recurring errors may deserve
   shorter intervals than vocabulary. Decide after observing whether
   mistake recurrence actually falls under the default schedule.
7. **Briefing delivery** — currently manual copy-paste. A ChatGPT
   custom instruction plus a clipboard command would remove most of the
   friction; worth doing only if the manual step proves to be what
   makes sessions get skipped.
