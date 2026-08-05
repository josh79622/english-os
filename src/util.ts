import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { IsoDate } from './types.ts';

// --- paths -----------------------------------------------------------------

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {
  items: path.join(ROOT, 'knowledge', 'items'),
  knowledgeIndex: path.join(ROOT, 'knowledge', 'INDEX.md'),
  profile: path.join(ROOT, 'knowledge', 'PROFILE.md'),
  sessions: path.join(ROOT, 'sessions'),
  state: path.join(ROOT, 'state'),
  stateIndex: path.join(ROOT, 'state', 'index.json'),
  metrics: path.join(ROOT, 'state', 'metrics.json'),
  pendingCorrections: path.join(ROOT, 'state', 'pending-corrections.json'),
  settingHistory: path.join(ROOT, 'state', 'setting-history.json'),
  briefing: path.join(ROOT, 'briefings', 'DAILY_BRIEFING.md'),
  setup: path.join(ROOT, 'briefings', 'COACH_SETUP.md'),
};

export function writeFile(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.endsWith('\n') ? contents : contents + '\n');
}

export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, value: unknown): void {
  writeFile(file, JSON.stringify(value, null, 2));
}

// --- dates -----------------------------------------------------------------

/**
 * The learner's calendar date, not UTC's.
 *
 * `toISOString()` would be wrong here: east of Greenwich it reports yesterday
 * until mid-morning local time, so a briefing generated before breakfast in
 * Sydney was dated a day behind — and everything downstream (due items,
 * overdue counts, the next review date) shifted with it.
 */
export function today(): IsoDate {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local `YYYY-MM-DD HH:MM`, for stamping when something happened. */
export function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * UTC-based by design — the only caller is `addDays`, which anchors its Date
 * at UTC midnight precisely so date arithmetic never touches a timezone or a
 * DST boundary. Do not "fix" this to local time.
 */
export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// --- misc ------------------------------------------------------------------

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export function weightedPick<T>(items: readonly T[], weights: readonly number[], rnd: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}
