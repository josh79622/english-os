/**
 * Contract A — the Session Report (ChatGPT → Claude).
 *
 * A malformed report stops the ingest. We never guess at parsing: a silently
 * misread report corrupts the knowledge base in ways that are very hard to
 * notice later.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ITEM_TYPES, DOMAINS } from './types.ts';
import type {
  Domain, Grade, Item, ItemType, MetricSample, PendingCorrection, SessionReport, Status,
} from './types.ts';
import { inferDomain, loadAllItems, makeId, saveItem } from './item.ts';
import { applyGrade, newItem } from './schedule.ts';
import { rebuildIndex } from './indexer.ts';
import { writeBriefing } from './briefing.ts';
import { checkHealth } from './health.ts';
import type { Violation } from './health.ts';
import { paths, readJson, writeJson, writeFile, today, nowStamp, isIsoDate } from './util.ts';

export class ReportError extends Error {}

// --- parsing ---------------------------------------------------------------

export function parseReport(text: string): SessionReport {
  const sections = splitSections(text);
  const head = parseFields(sections.get('__head__') ?? '');

  const sessionId = head['session_id'];
  const date = head['date'];
  if (!sessionId) throw new ReportError('missing `session_id`');
  if (!isIsoDate(date)) throw new ReportError('`date` must be YYYY-MM-DD');

  return {
    session_id: sessionId,
    date,
    duration_min: head['duration_min'] ? Number(head['duration_min']) : null,
    scenario: head['scenario'] ?? null,
    fluency_note: head['fluency_note'] ?? '',
    reviews: bullets(sections.get('REVIEW RESULTS')).map((b, n) => {
      const grade = Number(b['grade']);
      if (!b['id']) throw new ReportError(`REVIEW RESULTS line ${n + 1}: missing \`id\``);
      if (![0, 1, 2, 3].includes(grade)) {
        throw new ReportError(`REVIEW RESULTS line ${n + 1}: grade must be 0–3`);
      }
      return { id: b['id'], grade: grade as Grade, note: b['note'] ?? '' };
    }),
    new_items: bullets(sections.get('NEW ITEMS')).map((b, n) => {
      const type = b['type'] as ItemType;
      if (!ITEM_TYPES.includes(type)) {
        throw new ReportError(`NEW ITEMS line ${n + 1}: unknown type \`${b['type']}\``);
      }
      if (!b['title']) throw new ReportError(`NEW ITEMS line ${n + 1}: missing \`title\``);
      const domain = b['domain'] as Domain | undefined;
      return {
        type,
        title: b['title'],
        meaning: b['meaning'] ?? '',
        example: b['example'] ?? '',
        domain: domain && DOMAINS.includes(domain) ? domain : null,
      };
    }),
    corrections: bullets(sections.get('CORRECTIONS')).map((b, n) => {
      if (!b['said'] || !b['correct']) {
        throw new ReportError(`CORRECTIONS line ${n + 1}: needs \`said\` and \`correct\``);
      }
      return { said: b['said'], correct: b['correct'], rule: b['rule'] ?? '' };
    }),
    observations: (sections.get('COACH OBSERVATIONS') ?? '').trim(),
    raw: text.trim(),
  };
}

function splitSections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = '__head__';
  let buffer: string[] = [];

  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      out.set(current, buffer.join('\n'));
      current = (heading[1] ?? '').toUpperCase();
      buffer = [];
      continue;
    }
    if (/^#\s/.test(line) || /^<!--/.test(line)) continue;
    buffer.push(line);
  }
  out.set(current, buffer.join('\n'));
  return out;
}

function parseFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (m?.[1]) out[m[1]] = unquote(m[2] ?? '');
  }
  return out;
}

function bullets(block: string | undefined): Record<string, string>[] {
  if (!block) return [];
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => {
      const fields: Record<string, string> = {};
      for (const part of l.slice(2).split('|')) {
        const idx = part.indexOf(':');
        if (idx === -1) continue;
        fields[part.slice(0, idx).trim().toLowerCase()] = unquote(part.slice(idx + 1).trim());
      }
      return fields;
    });
}

function unquote(s: string): string {
  const t = s.trim();
  return /^".*"$/.test(t) || /^'.*'$/.test(t) ? t.slice(1, -1) : t;
}

// --- applying --------------------------------------------------------------

export interface IngestResult {
  report: SessionReport;
  created: string[];
  updated: string[];
  reinforced: string[];
  unknown: string[];
  violations: Violation[];
}

export function ingest(file: string): IngestResult {
  const report = parseReport(fs.readFileSync(file, 'utf8'));
  const items = new Map(loadAllItems().map((i) => [i.id, i]));
  const created: string[] = [];
  const updated: string[] = [];
  const reinforced: string[] = [];
  const unknown: string[] = [];
  /** Grades that reached a real item. Reported grades for unknown ids are not
   *  reviews of anything and must not reach the metrics. */
  const applied: Grade[] = [];

  // 3. REVIEW RESULTS
  for (const r of report.reviews) {
    const item = items.get(r.id);
    if (!item) {
      unknown.push(r.id);
      continue;
    }
    applyGrade(item, r.grade, report.date, report.session_id);
    item.frequency += 1;
    applied.push(r.grade);
    updated.push(`${item.id} (grade ${r.grade})`);
  }

  // 4. NEW ITEMS — an item already known is reinforced, not duplicated (H4).
  for (const n of report.new_items) {
    const id = makeId(n.type, n.title);
    const existing = items.get(id);
    if (existing) {
      existing.frequency += 1;
      existing.last_seen = report.date;
      reinforced.push(id);
      continue;
    }
    const body = [
      '## Meaning',
      n.meaning || '_TODO_',
      '',
      '## Usage',
      n.example ? `> "${n.example}"` : '_TODO_',
    ].join('\n');
    items.set(
      id,
      newItem({
        id,
        type: n.type,
        title: n.title,
        domain: [n.domain ?? inferDomain(report.scenario)],
        scenario: report.scenario,
        tags: [],
        body,
        date: report.date,
      }),
    );
    created.push(id);
  }

  // 5. CORRECTIONS — a correction seen twice becomes a `mistake` item.
  const promoted = applyCorrections(report, items);
  created.push(...promoted);

  for (const item of items.values()) saveItem(item);

  // 6–7. Rebuild derived views.
  const all = [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
  rebuildIndex(all);
  const briefing = writeBriefing(all, report.date);

  // Session record: immutable, written once.
  const sessionFile = path.join(paths.sessions, report.date.slice(0, 4), `${report.session_id}.md`);
  writeFile(
    sessionFile,
    [
      report.raw,
      '',
      '---',
      `Ingested: ${nowStamp()}`,
      `Items created: ${created.join(', ') || '—'}`,
      `Items updated: ${updated.join(', ') || '—'}`,
    ].join('\n'),
  );

  // 8. Metrics.
  recordMetrics(report, all, applied, created.length, briefing.backlog);

  return { report, created, updated, reinforced, unknown, violations: checkHealth() };
}

/**
 * Coaches sometimes file praise as a correction — the same sentence back,
 * with "(Good!)" appended. Left alone it banks as a pending mistake and
 * becomes a `mistake` item the second time the learner says it right.
 */
function isNoOpCorrection(said: string, correct: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/["'“”‘’]/g, '')
      .replace(/[.,!?;:]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(said) === norm(correct);
}

function applyCorrections(report: SessionReport, items: Map<string, Item>): string[] {
  const pending = readJson<PendingCorrection[]>(paths.pendingCorrections, []);
  const promoted: string[] = [];

  for (const c of report.corrections) {
    if (isNoOpCorrection(c.said, c.correct)) continue;
    const key = `${c.said.toLowerCase().trim()}→${c.correct.toLowerCase().trim()}`;
    const found = pending.find((p) => p.key === key);

    if (!found) {
      pending.push({ ...c, key, count: 1, first_seen: report.date, last_seen: report.date });
      continue;
    }

    found.count += 1;
    found.last_seen = report.date;

    const id = makeId('mistake', `${c.said} to ${c.correct}`);
    const existing = items.get(id);
    if (existing) {
      existing.frequency += 1;
      existing.last_seen = report.date;
      continue;
    }
    if (found.count >= 2) {
      items.set(
        id,
        newItem({
          id,
          type: 'mistake',
          title: `"${c.said}" → "${c.correct}"`,
          domain: [inferDomain(report.scenario)],
          scenario: report.scenario,
          tags: ['recurring'],
          body: ['## Rule', c.rule || '_TODO_', '', '## Seen', `- ${found.first_seen}`, `- ${report.date}`].join('\n'),
          date: report.date,
        }),
      );
      promoted.push(id);
    }
  }

  writeJson(paths.pendingCorrections, pending);
  return promoted;
}

function recordMetrics(
  report: SessionReport,
  items: Item[],
  grades: Grade[],
  createdCount: number,
  backlog: number,
): void {
  const metrics = readJson<MetricSample[]>(paths.metrics, []);
  const byStatus = { new: 0, learning: 0, familiar: 0, mastered: 0 } as Record<Status, number>;
  for (const i of items) byStatus[i.status] += 1;

  metrics.push({
    date: report.date,
    session_id: report.session_id,
    items_total: items.length,
    by_status: byStatus,
    reviews: grades.length,
    mean_grade: grades.length ? grades.reduce<number>((a, b) => a + b, 0) / grades.length : null,
    items_created: createdCount,
    due_backlog: backlog,
  });
  writeJson(paths.metrics, metrics);
}

export function summariseMetrics(): string {
  const metrics = readJson<MetricSample[]>(paths.metrics, []);
  if (metrics.length === 0) return 'No sessions ingested yet.';

  const last = metrics.at(-1) as MetricSample;
  const window = metrics.slice(-4); // ~1 week at 3–4 sessions/week
  const graded = window.filter((m) => m.mean_grade !== null);
  const rolling = graded.length
    ? graded.reduce((a, m) => a + (m.mean_grade ?? 0), 0) / graded.length
    : null;

  const verdict =
    rolling === null ? '—'
    : rolling > 2.6 ? 'intervals may be too short'
    : rolling < 2.0 ? 'too hard — slow down'
    : 'healthy';

  return [
    `Sessions ingested : ${metrics.length}  (latest ${last.session_id})`,
    `Items             : ${last.items_total}`,
    `  new / learning / familiar / mastered : ` +
      `${last.by_status.new} / ${last.by_status.learning} / ` +
      `${last.by_status.familiar} / ${last.by_status.mastered}`,
    `Mean grade (last ${graded.length}) : ${rolling?.toFixed(2) ?? '—'}  (${verdict})`,
    `Due backlog       : ${last.due_backlog}`,
  ].join('\n');
}
