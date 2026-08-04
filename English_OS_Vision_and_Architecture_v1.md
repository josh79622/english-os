# English OS

## Vision & Architecture Specification v1.0

> This document defines the long-term architecture for an AI-assisted
> English learning system.

# Vision

The goal is **not** to collect notes.

The goal is to build an **English Learning Operating System (English
OS)** that continuously improves spoken English through conversation,
knowledge management, and intelligent review.

------------------------------------------------------------------------

# Core Philosophy

Learning has four stages:

1.  Practice
2.  Extract Knowledge
3.  Review
4.  Mastery

Knowledge exists to improve future conversations.

The repository is a living knowledge base rather than a notebook.

------------------------------------------------------------------------

# Roles

## ChatGPT Voice

Role: English Coach

Responsibilities:

-   Hold realistic conversations.
-   Simulate Australian English.
-   Push fluency instead of perfection.
-   Introduce new vocabulary naturally.
-   Produce a structured Session Report.

ChatGPT never edits the repository.

------------------------------------------------------------------------

## Claude Code

Role: Knowledge Engineer & Repository Maintainer

Responsibilities:

-   Convert Session Reports into structured knowledge.
-   Maintain the repository.
-   Refactor continuously.
-   Remove duplication.
-   Improve information architecture.
-   Commit and push changes.

Claude owns the repository.

------------------------------------------------------------------------

## GitHub

GitHub is the single source of truth.

Neither AI should rely on conversational memory.

------------------------------------------------------------------------

# Repository Principles

## Single Source of Truth

Every concept has exactly one authoritative location.

## Knowledge over Logs

Session history is preserved.

Knowledge is distilled.

## Continuous Refactoring

Repository structure is expected to evolve.

Architecture is flexible.

Knowledge is permanent.

## AI-first Repository

The repository is primarily optimized for AI retrieval, not manual
browsing.

------------------------------------------------------------------------

# Repository Health Rules

Claude should continuously monitor:

-   Repository size
-   Token cost
-   Duplicate knowledge
-   Broken structure
-   Oversized documents
-   Missing indexes

Refactor whenever repository health degrades.

Never refactor based only on time.

Use repository health as the trigger.

------------------------------------------------------------------------

# Knowledge Rules

Never store raw feedback permanently.

Instead, extract reusable knowledge.

Examples:

Grammar rules

Vocabulary

Expressions

Conversation patterns

Common mistakes

Fluency observations

Scenario knowledge

Learning strategies

------------------------------------------------------------------------

# Session History

Sessions are immutable historical records.

Knowledge files evolve.

Never delete historical sessions.

Never duplicate historical content into knowledge files.

------------------------------------------------------------------------

# Review Engine

Learning requires repeated exposure.

Every knowledge item should support scheduled review.

Default review intervals:

-   Day 2
-   Day 4
-   Day 8
-   Day 16
-   Day 32
-   Day 64
-   Day 128

These intervals are the default strategy only.

The review strategy should be replaceable.

Examples:

-   Fixed intervals
-   SM-2
-   FSRS
-   Future algorithms

Knowledge and review strategy must remain independent.

------------------------------------------------------------------------

# Knowledge Schema

Every learning item should contain metadata.

Example:

``` yaml
status:
  new | learning | familiar | mastered

difficulty:
  easy | medium | hard

frequency:
  integer

first_seen:
  yyyy-mm-dd

last_seen:
  yyyy-mm-dd

last_review:
  yyyy-mm-dd

next_review:
  yyyy-mm-dd

review_history: []

mastery_score:
  0.0 - 1.0

confidence:
  0.0 - 1.0

scenario:
  pharmacy

tags:
  []
```

Claude may extend the schema while maintaining backward compatibility.

------------------------------------------------------------------------

# Review Engine Principles

Review should happen naturally.

Never interrupt conversation to quiz the learner.

Instead:

-   reintroduce vocabulary naturally
-   reuse grammar patterns
-   revisit expressions
-   create realistic scenarios

The learner should often be unaware that review is happening.

Conversation is the review mechanism.

------------------------------------------------------------------------

# Adaptive Mastery

Review success should influence future scheduling.

Examples:

-   Immediate understanding → increase interval.
-   Minor hesitation → small increase.
-   Significant hesitation → shorten interval.
-   Unable to recall → restart schedule.

Mastery should be adaptive.

------------------------------------------------------------------------

# Suggested Daily Review

Before each speaking session:

Review: - 3 due items

New: - 2 new concepts

Stretch: - 1 challenging concept

This keeps practice balanced.

------------------------------------------------------------------------

# Repository Governance

Claude should maintain:

-   ARCHITECTURE.md
-   CONSTITUTION.md
-   CONTRIBUTING.md
-   MAINTENANCE_RULES.md

These define:

-   system architecture
-   philosophy
-   maintenance rules
-   quality standards

------------------------------------------------------------------------

# North Star

Every repository update should:

1.  Increase knowledge density.
2.  Reduce retrieval cost.
3.  Improve future learning.
4.  Preserve historical accuracy.
5.  Make the next conversation more effective.

ChatGPT is the coach.

Claude Code is the knowledge engineer.

GitHub is the long-term memory.

The repository exists to improve English, not to archive conversations.
