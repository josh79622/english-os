# Constitution — English OS

> Non-negotiable principles. Everything else in this repository —
> architecture, thresholds, algorithms, tooling — may be replaced. This
> document may not, except by explicit decision of the learner.

---

## 1. Purpose

The goal is **not** to collect notes.

The goal is an **English Learning Operating System** that continuously
improves spoken English through conversation, knowledge management, and
intelligent review.

The repository exists to improve English, not to archive conversations.

## 2. The Learning Cycle

Learning has four stages: **Practice → Extract Knowledge → Review →
Mastery.**

Knowledge exists to improve future conversations. The repository is a
living knowledge base, not a notebook.

## 3. Division of Responsibility

**ChatGPT is the coach. Claude Code is the knowledge engineer. GitHub is
the long-term memory.**

- ChatGPT never edits the repository.
- Claude owns the repository.
- Neither AI relies on conversational memory. Every fact the system
  depends on lives in the repo.

## 4. Single Source of Truth

Every concept has exactly one authoritative location. This applies to
knowledge, to derived state, and to these governance documents
themselves.

Item files are authoritative. Indexes, briefings and metrics are derived
and disposable.

## 5. Knowledge over Logs

Session history is preserved. Knowledge is distilled.

Never store raw feedback permanently — extract reusable knowledge:
grammar rules, vocabulary, expressions, conversation patterns, common
mistakes, fluency observations, scenario knowledge, learning strategies.

## 6. Immutability

- Never delete a historical session.
- Never edit a historical session.
- Never duplicate session content into knowledge files.
- Never hand-edit scheduling or derived fields. Those belong to
  `src/schedule.ts`.

## 7. Review Is Invisible

Review happens through conversation. Never interrupt the learner to quiz
them. Reintroduce vocabulary, reuse grammar patterns, revisit
expressions, build realistic scenarios.

The learner should often be unaware that review is happening.

## 8. Structure Is Disposable, Knowledge Is Permanent

Repository structure is expected to evolve. Refactor continuously, but
**only when repository health degrades** — never on a schedule.

The repository is optimised for AI retrieval first, manual browsing
second.

## 9. North Star

Every repository update must:

1. Increase knowledge density.
2. Reduce retrieval cost.
3. Improve future learning.
4. Preserve historical accuracy.
5. Make the next conversation more effective.

An update that does none of these should not be made.

---

**See also:** [ARCHITECTURE.md](ARCHITECTURE.md) ·
[MAINTENANCE_RULES.md](MAINTENANCE_RULES.md) ·
[CONTRIBUTING.md](CONTRIBUTING.md)
