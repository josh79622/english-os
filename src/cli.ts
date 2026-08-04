#!/usr/bin/env node
/**
 * Single entry point. Every operation on the repository goes through here so
 * that derived state is never updated by hand.
 */

import { ingest, summariseMetrics, ReportError } from './ingest.ts';
import { writeBriefing, renderBriefing } from './briefing.ts';
import { rebuildIndex } from './indexer.ts';
import { checkHealth } from './health.ts';
import { ItemError } from './item.ts';
import { paths, today } from './util.ts';
import path from 'node:path';
import { ROOT } from './util.ts';

const rel = (p: string) => path.relative(ROOT, p);

function main(argv: string[]): number {
  const [command, ...rest] = argv;

  switch (command) {
    case 'ingest': {
      const file = rest[0];
      if (!file) {
        console.error('usage: npm run ingest -- <session-report.md>');
        return 2;
      }
      const r = ingest(file);
      console.log(`Ingested ${r.report.session_id} (${r.report.date})`);
      console.log(`  reviewed   : ${r.updated.join(', ') || '—'}`);
      console.log(`  created    : ${r.created.join(', ') || '—'}`);
      console.log(`  reinforced : ${r.reinforced.join(', ') || '—'}`);
      if (r.unknown.length) {
        console.log(`  unknown id : ${r.unknown.join(', ')}  (skipped)`);
      }
      report(r.violations);
      console.log(`\nBriefing written to ${rel(paths.briefing)}`);
      return 0;
    }

    case 'briefing': {
      const b = writeBriefing(undefined, rest[0] ?? today());
      console.log(renderBriefing(b));
      console.log(`\n--- written to ${rel(paths.briefing)}`);
      if (b.backlog > b.review.length) {
        console.log(`Note: ${b.backlog} items are due; ${b.review.length} briefed. Backlog carries over.`);
      }
      return 0;
    }

    case 'index': {
      const items = rebuildIndex();
      console.log(`Indexed ${items.length} items → ${rel(paths.knowledgeIndex)}, ${rel(paths.stateIndex)}`);
      return 0;
    }

    case 'health': {
      const violations = checkHealth({ fix: rest.includes('--fix') });
      report(violations);
      return violations.some((v) => v.severity === 'error') ? 1 : 0;
    }

    case 'stats':
      console.log(summariseMetrics());
      return 0;

    default:
      console.error(
        [
          'English OS',
          '',
          '  npm run ingest -- <file>   apply a Session Report',
          '  npm run briefing           regenerate the Daily Briefing',
          '  npm run index              rebuild INDEX.md and state/index.json',
          '  npm run health [-- --fix]  check repository health',
          '  npm run stats              show learning metrics',
        ].join('\n'),
      );
      return command ? 2 : 0;
  }
}

function report(violations: { check: string; severity: string; message: string }[]): void {
  if (violations.length === 0) {
    console.log('\nHealth: clean.');
    return;
  }
  console.log(`\nHealth: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.log(`  [${v.check}] ${v.severity === 'error' ? 'ERROR' : 'warn '} ${v.message}`);
  }
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (err) {
  if (err instanceof ReportError) {
    console.error(`Malformed Session Report: ${err.message}`);
    console.error('Nothing was ingested. Fix the report and re-run.');
    process.exit(1);
  }
  if (err instanceof ItemError) {
    console.error(`Corrupt item file: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
