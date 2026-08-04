/**
 * Schema types for English OS.
 *
 * Field names mirror the YAML frontmatter exactly (snake_case) so that
 * loading and saving an item is lossless and requires no mapping layer.
 * See ARCHITECTURE.md Part III.
 */

export const ITEM_TYPES = [
  'vocab',
  'expression',
  'grammar',
  'pattern',
  'mistake',
  'scenario',
  'strategy',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Ranked by priority — index 0 is the highest. See ARCHITECTURE.md Part VII. */
export const DOMAINS = ['work', 'social', 'daily', 'service'] as const;
export type Domain = (typeof DOMAINS)[number];

export type Status = 'new' | 'learning' | 'familiar' | 'mastered';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** 0 cannot recall · 1 significant hesitation · 2 minor hesitation · 3 immediate */
export type Grade = 0 | 1 | 2 | 3;

/** `YYYY-MM-DD` */
export type IsoDate = string;

export interface ReviewEntry {
  date: IsoDate;
  grade: Grade;
  session: string;
}

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  domain: Domain[];
  scenario: string | null;
  tags: string[];

  first_seen: IsoDate;
  last_seen: IsoDate;

  // Scheduling — owned by schedule.ts, never hand-edited.
  interval: number;
  ease: number;
  last_review: IsoDate | null;
  next_review: IsoDate;
  review_history: ReviewEntry[];

  // Derived — recomputed by schedule.ts, never hand-edited.
  mastery_score: number;
  status: Status;
  difficulty: Difficulty;
  frequency: number;

  /** Markdown body below the frontmatter. Not part of the schema proper. */
  body: string;
}

/** Everything except `body` — what lands in state/index.json. */
export type ItemMeta = Omit<Item, 'body'>;

export interface SessionReport {
  session_id: string;
  date: IsoDate;
  duration_min: number | null;
  scenario: string | null;
  fluency_note: string;
  reviews: { id: string; grade: Grade; note: string }[];
  new_items: {
    type: ItemType;
    title: string;
    meaning: string;
    example: string;
    domain: Domain | null;
  }[];
  corrections: { said: string; correct: string; rule: string }[];
  observations: string;
  /** The report exactly as received. Persisted verbatim. */
  raw: string;
}

export interface PendingCorrection {
  key: string;
  said: string;
  correct: string;
  rule: string;
  count: number;
  first_seen: IsoDate;
  last_seen: IsoDate;
}

export interface MetricSample {
  date: IsoDate;
  session_id: string;
  items_total: number;
  by_status: Record<Status, number>;
  reviews: number;
  mean_grade: number | null;
  items_created: number;
  due_backlog: number;
}
