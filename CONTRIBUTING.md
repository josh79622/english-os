# Contributing — English OS

> The operational workflow: how a spoken session becomes a commit.
> Principles live in [CONSTITUTION.md](CONSTITUTION.md); structures in
> [ARCHITECTURE.md](ARCHITECTURE.md); thresholds in
> [MAINTENANCE_RULES.md](MAINTENANCE_RULES.md).

---

## Governance Documents

Each has exactly one job. Single Source of Truth applies to governance
too — no content is duplicated between them.

| Document | Owns |
|---|---|
| `CONSTITUTION.md` | Non-negotiable principles. Changes only by explicit learner decision. |
| `ARCHITECTURE.md` | Structures, algorithms, decision log. |
| `CONTRACTS.md` | The Session Report and Daily Briefing formats. Locked. |
| `MAINTENANCE_RULES.md` | Health thresholds, refactor procedure, schema migration log. |
| `CONTRIBUTING.md` | This file: the operational workflow. |

## The Session Loop

```
npm run briefing        →  paste into ChatGPT Voice  →  speak
        ↑                                                  ↓
   commit & push        ←  npm run ingest -- <file>  ←  Session Report
```

### 1. Before speaking

```sh
npm run briefing
```

Prints and writes `briefings/DAILY_BRIEFING.md`. Paste it into ChatGPT
Voice as the session opener — it is self-contained, so it is the only
thing you paste. Every run picks a different scenario and persona, so
rerun it if the scene does not suit. **Paste it as text.** Attaching it as a
file makes ChatGPT treat it as a document to review — it will summarise the
briefing back to you and offer to help improve it instead of starting.
It selects 3 due + 2 new + 1 stretch,
plus up to 3 recurring mistakes to watch for, carries `knowledge/PROFILE.md`
so ordinary questions about your life always have an answer, and closes with
the Session Report spec.

If more items are due than fit, **the backlog carries over.** Never
inflate the briefing to catch up — a sustained backlog is a health
signal (H6), not something to paper over.

### 2. After speaking

Save ChatGPT's Session Report to a file, then:

```sh
npm run ingest -- path/to/report.md
```

This performs the whole pipeline:

1. Validate the report. **Malformed → stop.** Nothing is written. We
   never guess at parsing; a silently misread report corrupts the
   knowledge base in ways that are hard to notice later.
2. Save the report verbatim to `sessions/YYYY/<session_id>.md`, with an
   ingestion footer. That file is then immutable.
3. Apply `REVIEW RESULTS` — `applyGrade()` per item.
4. Apply `NEW ITEMS` — create item files. An already-known item is
   *reinforced* (`frequency += 1`, `last_seen` updated), never
   duplicated (H4).
5. Apply `CORRECTIONS` — a correction seen **twice** becomes a `mistake`
   item. First sightings wait in `state/pending-corrections.json`.
6. Rebuild `knowledge/INDEX.md` and `state/index.json`.
7. Regenerate the next briefing.
8. Append metrics, then run every health check.

### 3. Commit

```
session(2026-08-04-01): +2 items, 3 reviewed, 0 health violations
```

Use `refactor:` for maintenance commits and name the check that
triggered them; `spec:` for governance changes.

## Commands

| Command | Purpose |
|---|---|
| `npm run briefing` | Regenerate the Daily Briefing |
| `npm run ingest -- <file>` | Apply a Session Report |
| `npm run index` | Rebuild `INDEX.md` and `state/index.json` |
| `npm run health [-- --fix]` | Check repository health |
| `npm run stats` | Learning metrics |
| `npm run typecheck` | Type-check `src/` |

## Rules for Editing

**Never hand-edit** — owned by `src/schedule.ts` and regenerated:

`interval` · `ease` · `last_review` · `next_review` · `review_history` ·
`mastery_score` · `status` · `difficulty`

**Safe to hand-edit** on an item: `title`, `domain`, `scenario`, `tags`,
and the Markdown body. Run `npm run index` afterwards.

**Never edit at all**: anything under `sessions/`.

Anything in `state/`, `briefings/`, or `knowledge/INDEX.md` can be
deleted and rebuilt — it is all derived.

## Changing the Review Algorithm

Replace `src/schedule.ts` and nothing else. Its only entry point is:

```ts
applyGrade(item: Item, grade: Grade, today: IsoDate, sessionId: string): Item
```

Strategy-private fields must be namespaced (e.g. `fsrs_stability`) and
logged in the schema migration table.

---

**See also:** [CONSTITUTION.md](CONSTITUTION.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) ·
[MAINTENANCE_RULES.md](MAINTENANCE_RULES.md)
