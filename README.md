# English OS

An English learning operating system: conversation, knowledge management,
and intelligent review.

The goal is **not** to collect notes. It is to build a system where every
spoken session leaves behind structured knowledge, and that knowledge
comes back — invisibly — in the next conversation.

## How it works

```
npm run briefing        →  paste into ChatGPT Voice  →  speak
        ↑                                                  ↓
   commit & push        ←  npm run ingest -- <file>  ←  Session Report
```

- **ChatGPT Voice** is the coach. It converses in Australian English,
  weaves due items into the conversation without quizzing, and emits a
  Session Report.
- **Claude Code** is the knowledge engineer. It turns reports into
  structured items, schedules reviews, and maintains the repository.
- **GitHub** is the long-term memory. Neither AI relies on conversational
  memory.

ChatGPT cannot read this repository, so the loop is closed by two
paste-sized artifacts: the **Daily Briefing** going in, the **Session
Report** coming out.

## Getting started

```sh
npm install
npm run briefing      # generate today's briefing
npm run ingest -- report.md
npm run stats
```

## Repository

| Path | Contents |
|---|---|
| `knowledge/items/` | The knowledge base. One item per file — the source of truth. |
| `knowledge/PROFILE.md` | Standing facts about me. Hand-written; carried into every briefing. |
| `sessions/` | Raw Session Reports. Immutable. |
| `state/`, `briefings/` | Derived. Safe to delete and rebuild. |
| `src/` | The tooling. `schedule.ts` is the only place dates are decided. |

## Documents

- [CONSTITUTION.md](CONSTITUTION.md) — principles that don't change
- [ARCHITECTURE.md](ARCHITECTURE.md) — schemas and algorithms
- [CONTRACTS.md](CONTRACTS.md) — the two locked AI interfaces
- [MAINTENANCE_RULES.md](MAINTENANCE_RULES.md) — health thresholds
- [CONTRIBUTING.md](CONTRIBUTING.md) — the day-to-day workflow

## Review model

New items start at a 2-day interval and double. Each review is graded
0–3 by the coach; `src/schedule.ts` — and only `src/schedule.ts` — turns
that grade into the next date. With every grade at 3 the schedule is
exactly 2, 4, 8, 16, 32, 64, 128 days.

Target cadence: **3–4 sessions per week.**
