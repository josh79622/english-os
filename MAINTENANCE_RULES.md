# Maintenance Rules — English OS

> Health thresholds, refactor procedures, and the schema migration log.
> Principles live in [CONSTITUTION.md](CONSTITUTION.md); structures and
> algorithms in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Refactor Trigger

**Refactor is triggered by health violations, never by elapsed time.**

"Monitor repository health" without numbers leaves Claude guessing, so
every rule below is a threshold a machine can check. `src/health.ts`
implements them; `npm run health` runs them, and every ingest runs them
automatically.

## Health Checks

| # | Check | Threshold | Action |
|---|---|---|---|
| H1 | Item file length | > 120 lines | Split or trim; an item is not an essay |
| H2 | Governance doc length | > 400 lines | Split into focused documents |
| H3 | Index staleness | any item missing from `state/index.json` | Regenerate index |
| H4 | Duplicate knowledge | same `type` and title similarity ≥ 0.85 | Merge into the older `id`, redirect links |
| H5 | Orphan links | `[[id]]` pointing at a nonexistent item | Create the target, or fix the link |
| H6 | Review backlog | due items > 15 across 3 consecutive sessions | Raise session frequency or lengthen intervals |
| H7 | Briefing budget | briefing > 40 lines | Selection logic is over-including |
| H8 | Schema drift | item missing a required field | Migrate, and log it below |
| H9 | Total context cost | `INDEX.md` > 1500 lines | Shard the index by type |
| H10 | Stale items | `status: new` and `last_seen` > 180 days | Archive or drop — introduced, never used |

**Severity.** H3, H4, H6 and H8 are errors (they corrupt or block the
system). The rest are warnings (they degrade it).

### What gets fixed automatically

Only **H3**. `npm run health -- --fix` rebuilds the index, because a
stale index has exactly one correct resolution.

Everything else requires judgment and is reported, not fixed:

- **H5** — a broken link usually means the *target should be created*,
  not that the link is wrong. Deleting it silently destroys a real
  relationship between two pieces of knowledge.
- **H8** — the right default for a missing field depends on why it is
  missing. Migrate deliberately and record it in the log below.

> This is a deliberate narrowing of the v1.1 spec, which listed H3, H5
> and H8 as auto-fixable. Auto-editing prose or schema without review is
> how a knowledge base quietly rots.

## Refactor Procedure

1. Run `npm run health`. Fix errors before warnings.
2. Change one thing at a time. Rebuild derived state after each
   (`npm run index`).
3. Never change item `id`s. If a merge forces it, keep the older `id`
   and update every `[[link]]` pointing at the retired one.
4. Re-run `npm run health` and confirm the violation is gone.
5. Commit with `refactor:` and state which check triggered it.

## Calibration Assumptions

These thresholds assume the current cadence of **3–4 sessions per week**.
If actual cadence diverges for 3+ consecutive weeks, re-tune rather than
letting backlog grow silently:

- Fewer sessions → raise `INTERVAL_FIRST`, or review more items per
  session.
- More sessions → allow more new items per session.

## Schema Migration Log

The schema may be extended, but only in a backward-compatible way, and
every change is recorded here.

| Date | Change | Migration |
|---|---|---|
| 2026-08-04 | Initial v1.1 schema | — |

---

**See also:** [CONSTITUTION.md](CONSTITUTION.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [CONTRIBUTING.md](CONTRIBUTING.md)
