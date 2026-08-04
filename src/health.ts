/**
 * Repository health checks (H1–H10). See MAINTENANCE_RULES.md.
 *
 * Refactoring is triggered by violations, never by elapsed time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadAllItems, itemPath, ItemError } from './item.ts';
import { renderSelection, selectBriefing } from './briefing.ts';
import { rebuildIndex } from './indexer.ts';
import type { Item, MetricSample } from './types.ts';
import { ROOT, paths, readJson, today, daysBetween } from './util.ts';

export interface Violation {
  check: string;
  severity: 'error' | 'warn';
  message: string;
  fixable: boolean;
}

const LIMITS = {
  itemLines: 120,
  govLines: 400,
  backlogItems: 15,
  backlogDays: 3,
  briefingLines: 40,
  indexLines: 1500,
  staleDays: 180,
  titleSimilarity: 0.85,
};

const GOVERNANCE_DOCS = [
  'README.md', 'ARCHITECTURE.md', 'CONSTITUTION.md',
  'MAINTENANCE_RULES.md', 'CONTRIBUTING.md',
];

export function checkHealth(opts: { fix?: boolean } = {}): Violation[] {
  const v: Violation[] = [];
  const now = today();

  // H8 — schema drift. Runs first: everything else assumes items parse.
  let items: Item[] = [];
  try {
    items = loadAllItems();
  } catch (err) {
    if (err instanceof ItemError) {
      v.push({ check: 'H8', severity: 'error', message: err.message, fixable: false });
      return v;
    }
    throw err;
  }

  // H1 — item file length. An item is not an essay.
  for (const item of items) {
    const lines = fs.readFileSync(itemPath(item), 'utf8').split('\n').length;
    if (lines > LIMITS.itemLines) {
      v.push({
        check: 'H1', severity: 'warn', fixable: false,
        message: `${item.id} is ${lines} lines (limit ${LIMITS.itemLines}) — split or trim`,
      });
    }
  }

  // H2 — governance doc length.
  for (const doc of GOVERNANCE_DOCS) {
    const file = path.join(ROOT, doc);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    if (lines > LIMITS.govLines) {
      v.push({
        check: 'H2', severity: 'warn', fixable: false,
        message: `${doc} is ${lines} lines (limit ${LIMITS.govLines}) — split into focused documents`,
      });
    }
  }

  // H3 — index staleness.
  const indexed = new Set(
    readJson<{ items: { id: string }[] }>(paths.stateIndex, { items: [] }).items.map((i) => i.id),
  );
  const missing = items.filter((i) => !indexed.has(i.id));
  if (missing.length > 0 || indexed.size !== items.length) {
    if (opts.fix) {
      rebuildIndex(items);
    } else {
      v.push({
        check: 'H3', severity: 'error', fixable: true,
        message: `index is stale (${missing.length} unindexed) — run \`npm run index\``,
      });
    }
  }

  // H4 — duplicate knowledge.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i] as Item;
      const b = items[j] as Item;
      if (a.type !== b.type) continue;
      const sim = similarity(a.title.toLowerCase(), b.title.toLowerCase());
      if (sim >= LIMITS.titleSimilarity) {
        v.push({
          check: 'H4', severity: 'error', fixable: false,
          message:
            `\`${a.id}\` and \`${b.id}\` look like duplicates (${sim.toFixed(2)}) — ` +
            `merge into the older id and redirect links`,
        });
      }
    }
  }

  // H5 — orphan links. Not auto-fixed: a broken link often means the target
  // should be created, not that the link is wrong. That is a judgment call.
  const ids = new Set(items.map((i) => i.id));
  for (const item of items) {
    for (const m of item.body.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const target = m[1]?.trim() ?? '';
      if (!ids.has(target)) {
        v.push({
          check: 'H5', severity: 'warn', fixable: false,
          message: `${item.id} links to \`${target}\`, which does not exist`,
        });
      }
    }
  }

  // H6 — sustained review backlog. Cadence assumption: 3–4 sessions/week.
  const metrics = readJson<MetricSample[]>(paths.metrics, []);
  const recent = metrics.slice(-LIMITS.backlogDays);
  if (
    recent.length === LIMITS.backlogDays &&
    recent.every((m) => m.due_backlog > LIMITS.backlogItems)
  ) {
    v.push({
      check: 'H6', severity: 'error', fixable: false,
      message:
        `backlog has exceeded ${LIMITS.backlogItems} for ${LIMITS.backlogDays} sessions — ` +
        `raise session frequency or lengthen intervals`,
    });
  }

  // H7 — briefing budget. Measures the selected items only; the fixed coach
  // instructions and report spec are overhead the selection cannot inflate.
  const briefingLines = renderSelection(selectBriefing(items, now)).split('\n').length;
  if (briefingLines > LIMITS.briefingLines) {
    v.push({
      check: 'H7', severity: 'warn', fixable: false,
      message: `briefing selection is ${briefingLines} lines (limit ${LIMITS.briefingLines}) — selection is over-including`,
    });
  }

  // H9 — total context cost.
  if (fs.existsSync(paths.knowledgeIndex)) {
    const lines = fs.readFileSync(paths.knowledgeIndex, 'utf8').split('\n').length;
    if (lines > LIMITS.indexLines) {
      v.push({
        check: 'H9', severity: 'warn', fixable: false,
        message: `INDEX.md is ${lines} lines (limit ${LIMITS.indexLines}) — shard the index by type`,
      });
    }
  }

  // H10 — stale items: introduced, never used, never useful.
  for (const item of items) {
    if (item.status === 'new' && daysBetween(item.last_seen, now) > LIMITS.staleDays) {
      v.push({
        check: 'H10', severity: 'warn', fixable: false,
        message: `${item.id} has been \`new\` since ${item.last_seen} — archive or drop`,
      });
    }
  }

  return v;
}

/** Normalised Levenshtein similarity, 0–1. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = curr;
  }
  return 1 - (prev[b.length] as number) / Math.max(a.length, b.length);
}
