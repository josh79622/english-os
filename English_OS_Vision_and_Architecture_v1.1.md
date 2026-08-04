# English OS

## Vision & Architecture Specification v1.1

> Long-term architecture for an AI-assisted English learning system.
>
> **v1.1 changes:** v1.0 defined the philosophy. v1.1 adds the executable
> layer — the contracts, schemas, algorithms and thresholds required to
> actually run the system. Philosophy sections are preserved; where v1.0
> was ambiguous, v1.1 makes a decision and says so.

---

# Part I — Vision

## The Goal

The goal is **not** to collect notes.

The goal is an **English Learning Operating System** that continuously
improves spoken English through conversation, knowledge management, and
intelligent review.

## Core Philosophy

Learning has four stages:

1. Practice
2. Extract Knowledge
3. Review
4. Mastery

Knowledge exists to improve future conversations.

The repository is a living knowledge base, not a notebook.

## North Star

Every repository update should:

1. Increase knowledge density.
2. Reduce retrieval cost.
3. Improve future learning.
4. Preserve historical accuracy.
5. Make the next conversation more effective.

ChatGPT is the coach. Claude Code is the knowledge engineer. GitHub is
the long-term memory.

The repository exists to improve English, not to archive conversations.

---

# Part II — Roles & The Information Loop

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

# Part III — Data Model

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
├── ARCHITECTURE.md             # this spec, current version
├── CONSTITUTION.md             # non-negotiable principles
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
├── state/
│   ├── index.json              # derived: id → scheduling fields
│   └── metrics.json            # derived: time series
│
├── briefings/
│   └── DAILY_BRIEFING.md       # regenerated each session
│
└── scripts/
    ├── ingest.py               # validate + apply a Session Report
    ├── schedule.py             # grade → next_review (the ONLY scheduler)
    ├── briefing.py             # select due items, render briefing
    ├── index.py                # rebuild INDEX.md + state/index.json
    └── health.py               # check thresholds, report violations
```

## Item Schema

```yaml
---
id: vocab-knock-off              # stable, immutable, = filename stem
type: vocab                      # vocab|expression|grammar|pattern|
                                 # mistake|scenario|strategy
title: knock off                 # display form
domain: [work, social]           # learning domains (see Part VII)
scenario: workplace              # primary situational context
tags: [slang, au]

# --- lifecycle ---
first_seen: 2026-08-04
last_seen: 2026-08-04

# --- scheduling (owned by scripts/schedule.py, never hand-edited) ---
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
ingestion footer written once by `ingest.py`:

```
Ingested: 2026-08-04T21:30
Items created: vocab-knock-off, expression-arvo
Items updated: grammar-present-perfect (grade 2)
```

---

# Part IV — The Two Contracts

These are the only interfaces between the AIs. **Format is locked.** If
either drifts, extraction quality silently degrades.

## Contract A — Session Report (ChatGPT → Claude)

Produced by ChatGPT at the end of every voice session. Install as a
ChatGPT custom instruction so the format never drifts.

````markdown
# SESSION REPORT
session_id: 2026-08-04-01
date: 2026-08-04
duration_min: 25
scenario: pharmacy
fluency_note: Hesitated on past tense; good recovery; pace improving.

## REVIEW RESULTS
<!-- One line per briefed item. grade: 0-3. Omit items that never
     came up naturally; do NOT force them. -->
- id: vocab-knock-off | grade: 3 | note: used unprompted
- id: grammar-present-perfect | grade: 1 | note: reverted to simple past

## NEW ITEMS
- type: vocab | title: arvo | meaning: afternoon | example: "See you this arvo."
- type: expression | title: fair enough | meaning: acceptance/concession | example: "Fair enough, let's do that."

## CORRECTIONS
<!-- What the learner said wrong → what it should be. Claude converts
     recurring ones into `mistake` items. -->
- said: "I have went there yesterday" | correct: "I went there yesterday" | rule: past simple with a finished time

## COACH OBSERVATIONS
Free text. Anything not captured above.
````

**Rules**
- `grade` scale: `0` cannot recall · `1` significant hesitation ·
  `2` minor hesitation · `3` immediate and correct.
- ChatGPT grades; ChatGPT never computes dates.
- Unreviewed briefed items are simply absent — absence is not failure.

## Contract B — Daily Briefing (Claude → ChatGPT)

Generated by `briefing.py` before each session. The learner pastes it
into ChatGPT Voice as the session opener.

````markdown
# DAILY BRIEFING — 2026-08-04
You are my English coach. Australian English. Push fluency, not perfection.
Weave the items below into natural conversation. NEVER quiz me directly and
never mention this briefing. At the end, output a SESSION REPORT in the
locked format.

Suggested scenario: pharmacy

## REVIEW (work these in naturally)
- knock off (vocab) — "to finish work for the day"
- present perfect vs past simple (grammar)
- fair enough (expression)

## NEW (introduce these)
- script / prescription (vocab)
- over the counter (expression)

## STRETCH (one hard thing)
- reported speech in complaints

## WATCH FOR (my recurring mistakes)
- "have went" → "went"
````

Selection rule: **3 due + 2 new + 1 stretch** (from v1.0), where
- **due** = `next_review <= today`, ordered by most overdue, then lowest
  `mastery_score`;
- **new** = `status: new`, prioritised by active learning domain;
- **stretch** = highest-difficulty item with `mastery_score < 0.5`;
- **watch for** = up to 3 `mistake` items with the highest `frequency`.

If more than 3 items are due, the backlog carries over — never inflate
the briefing. Sustained backlog is a health violation (Part VI).

---

# Part V — Review Engine

## Principles (unchanged from v1.0)

Review happens naturally. Never interrupt conversation to quiz the
learner. Reintroduce vocabulary, reuse grammar patterns, revisit
expressions, build realistic scenarios. The learner should often be
unaware review is happening. **Conversation is the review mechanism.**

## Scheduling — Deterministic, Not Judgment

**The LLM never picks dates.** ChatGPT emits a grade; `schedule.py`
computes the schedule. This is what makes "knowledge and review strategy
remain independent" real rather than aspirational.

```python
# scripts/schedule.py — default strategy: "ladder-ease"
EASE_MIN, EASE_MAX = 1.3, 2.8
INTERVAL_MAX = 180
INTERVAL_FIRST = 2

def apply_grade(item, grade, today):
    ease, interval = item.ease, item.interval

    if grade == 0:      # cannot recall → restart
        ease -= 0.20
        interval = 1
    elif grade == 1:    # significant hesitation → shorten
        ease -= 0.15
        interval = max(1, round(interval * 0.5))
    elif grade == 2:    # minor hesitation → small increase
        ease -= 0.05
        interval = max(1, round(interval * ease * 0.8))
    else:               # grade 3 → full increase
        ease += 0.05
        interval = round(interval * ease)

    item.ease        = clamp(ease, EASE_MIN, EASE_MAX)
    item.interval    = min(interval, INTERVAL_MAX)
    item.last_review = today
    item.next_review = today + days(item.interval)
    item.review_history.append({...})
    recompute_derived(item)
```

New items start at `interval = 2`, `ease = 2.0`. **With every grade at
3, this reproduces the v1.0 ladder exactly: 2, 4, 8, 16, 32, 64, 128.**
The default strategy is therefore a strict superset of v1.0 — adaptive
where v1.0 was fixed, identical where it wasn't.

## Strategy Independence

`schedule.py` must expose exactly one entry point:

```python
apply_grade(item, grade, today) -> item
```

Swapping to SM-2, FSRS, or anything future means replacing that one
file. No knowledge file changes. No schema changes beyond additive
strategy-private fields (namespaced, e.g. `fsrs_stability`).

---

# Part VI — Repository Health

v1.0 said "monitor repository health" without thresholds, which leaves
Claude guessing. `scripts/health.py` checks these concrete rules.
Refactor is triggered by **violations, never by elapsed time.**

| # | Check | Threshold | Action |
|---|---|---|---|
| H1 | Item file length | > 120 lines | Split or trim; an item is not an essay |
| H2 | Governance doc length | > 400 lines | Split into focused documents |
| H3 | Index staleness | any item not in `INDEX.md` | Regenerate index |
| H4 | Duplicate knowledge | two items with same `title` + `type`, or >0.85 title similarity | Merge, keep older `id`, redirect links |
| H5 | Orphan links | `[[id]]` pointing to nonexistent item | Fix or remove |
| H6 | Review backlog | due items > 15 for 3+ consecutive days | Session frequency or intervals need adjusting — report to learner |
| H7 | Briefing budget | briefing > 40 lines | Selection logic is over-including |
| H8 | Schema drift | item missing a required field | Migrate |
| H9 | Total context cost | `INDEX.md` > 1500 lines | Shard index by type |
| H10 | Stale items | `last_seen` > 180 days and `status: new` | Archive or drop — never introduced, never useful |

Health check runs on every ingest. Violations are reported; H3, H5, H8
are auto-fixed.

---

# Part VII — Learning Domains

v1.0 never stated *what* the learner is trying to be able to do, so
vocabulary would grow in random directions and "new item" selection
would have no priority signal.

**Domains must be defined and ranked by the learner.** Provisional set
below — replace with the real one:

| Priority | Domain | Description |
|---|---|---|
| 1 | `daily` | Australian daily life: shops, pharmacy, transport, appointments |
| 2 | `social` | Small talk, humour, slang, building rapport |
| 3 | `work` | Meetings, updates, disagreement, negotiation |
| 4 | `service` | Complaints, requests, phone calls, bureaucracy |

Every item carries at least one `domain`. New-item selection draws from
the highest-priority domain that is under-represented. Domains can be
re-ranked at any time; that changes future selection only, never
existing knowledge.

> ⚠️ **Open decision — requires the learner.** The table above is a
> placeholder. Confirm or replace before the first real session.

---

# Part VIII — Metrics

Without measurement there is no way to know the system works.
`state/metrics.json` is appended on every ingest; a weekly summary is
rendered into `README.md`.

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

# Part IX — Governance

Claude maintains four documents. Each has exactly one job — no
overlapping content (Single Source of Truth applies to governance too):

| Document | Owns |
|---|---|
| `CONSTITUTION.md` | Non-negotiable principles. Changes rarely, only with explicit learner approval. |
| `ARCHITECTURE.md` | This spec: structures, contracts, algorithms. Versioned. |
| `MAINTENANCE_RULES.md` | Health thresholds, refactor procedures, schema migration log. |
| `CONTRIBUTING.md` | Operational workflow: how a session becomes a commit. |

## Standard Ingest Workflow

1. Learner pastes Session Report → saved verbatim to `sessions/YYYY/`.
2. `ingest.py` validates the format. Malformed report → stop and report;
   never guess at parsing.
3. Apply `REVIEW RESULTS`: `apply_grade()` per item.
4. Apply `NEW ITEMS`: create item files. Check H4 first — an existing
   item gets `frequency += 1` and `last_seen` updated instead.
5. Apply `CORRECTIONS`: a correction seen twice becomes a `mistake` item.
6. Rebuild index, run health check, auto-fix H3/H5/H8, report the rest.
7. Regenerate `DAILY_BRIEFING.md`.
8. Update metrics. Commit with:
   `session(2026-08-04-01): +2 items, 3 reviewed, 0 health violations`

## Immutability Rules

- Never delete a historical session.
- Never duplicate session content into knowledge files.
- Never hand-edit scheduling or derived fields.
- Never store raw feedback permanently — extract reusable knowledge:
  grammar rules, vocabulary, expressions, conversation patterns, common
  mistakes, fluency observations, scenario knowledge, learning
  strategies.

---

# Part X — Open Decisions

Blocking items requiring the learner's input:

1. **Learning domains** (Part VII) — the placeholder table must be
   confirmed or replaced.
2. **Session cadence** — target sessions per week; H6 and interval
   tuning depend on it.
3. **Scripting language** — spec assumes Python; Node is equally viable.
4. **Repository hosting** — this project is not yet a git repository.
   Nothing in this architecture functions until it is.

Non-blocking, revisit later:

5. Migration to FSRS once ~50 items have ≥5 reviews each (enough data
   to justify it).
6. Whether `mistake` items should have their own accelerated schedule.
