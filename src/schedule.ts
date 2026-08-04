/**
 * The ONLY scheduler.
 *
 * The LLM emits a grade; this file decides every date. Swapping to SM-2,
 * FSRS, or anything future means replacing this file and nothing else —
 * that is what keeps knowledge and review strategy independent.
 *
 * Strategy: "ladder-ease". With every grade at 3 it reproduces the original
 * fixed ladder exactly — 2, 4, 8, 16, 32, 64, 128 — so it is a strict
 * superset of the v1.0 strategy.
 */

import type { Difficulty, Grade, IsoDate, Item, ItemType, Status } from './types.ts';
import { addDays, clamp, round } from './util.ts';

export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;
export const INTERVAL_MAX = 180;
export const INTERVAL_FIRST = 2;
export const EASE_FIRST = 2.0;

export function applyGrade(item: Item, grade: Grade, todayDate: IsoDate, sessionId: string): Item {
  let { ease, interval } = item;

  switch (grade) {
    case 0: // cannot recall → restart the schedule
      ease -= 0.2;
      interval = 1;
      break;
    case 1: // significant hesitation → shorten
      ease -= 0.15;
      interval = Math.max(1, Math.round(interval * 0.5));
      break;
    case 2: // minor hesitation → small increase
      ease -= 0.05;
      interval = Math.max(1, Math.round(interval * ease * 0.8));
      break;
    case 3: // immediate and correct → full increase
      ease += 0.05;
      interval = Math.round(interval * ease);
      break;
  }

  item.ease = round(clamp(ease, EASE_MIN, EASE_MAX), 2);
  item.interval = Math.min(interval, INTERVAL_MAX);
  item.last_review = todayDate;
  item.last_seen = todayDate;
  item.next_review = addDays(todayDate, item.interval);
  item.review_history.push({ date: todayDate, grade, session: sessionId });

  return recomputeDerived(item);
}

export function recomputeDerived(item: Item): Item {
  const history = item.review_history;
  const last = history.at(-1);

  if (last) {
    item.mastery_score = round(clamp(0.7 * item.mastery_score + 0.3 * (last.grade / 3), 0, 1));
  }
  item.status = deriveStatus(item);
  item.difficulty = deriveDifficulty(item);
  return item;
}

function deriveStatus(item: Item): Status {
  if (item.mastery_score >= 0.8 && item.interval >= 32) return 'mastered';
  if (item.mastery_score >= 0.55) return 'familiar';
  if (item.review_history.length >= 1) return 'learning';
  return 'new';
}

function deriveDifficulty(item: Item): Difficulty {
  const total = item.review_history.length;
  if (total === 0) return 'medium';
  const failures = item.review_history.filter((r) => r.grade <= 1).length;
  const failRate = failures / total;
  if (failRate > 0.4) return 'hard';
  if (failRate < 0.1 && total >= 3) return 'easy';
  return 'medium';
}

export function newItem(fields: {
  id: string;
  type: ItemType;
  title: string;
  domain: Item['domain'];
  scenario: string | null;
  tags: string[];
  body: string;
  date: IsoDate;
}): Item {
  return {
    id: fields.id,
    type: fields.type,
    title: fields.title,
    domain: fields.domain,
    scenario: fields.scenario,
    tags: fields.tags,
    first_seen: fields.date,
    last_seen: fields.date,
    interval: INTERVAL_FIRST,
    ease: EASE_FIRST,
    last_review: null,
    next_review: addDays(fields.date, INTERVAL_FIRST),
    review_history: [],
    mastery_score: 0,
    status: 'new',
    difficulty: 'medium',
    frequency: 1,
    body: fields.body,
  };
}
