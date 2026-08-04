/**
 * Contract B — the Daily Briefing (Claude → ChatGPT).
 *
 * This closes the loop the architecture depends on: ChatGPT Voice cannot read
 * the repository, so everything it needs for a session must fit in one
 * paste-sized artifact. Keep it short. An over-full briefing is a bug, not a
 * feature — see health check H7.
 */

import { DOMAINS } from './types.ts';
import type { Domain, Item } from './types.ts';
import { loadAllItems } from './item.ts';
import { paths, writeFile, today, daysBetween, seededRandom, weightedPick } from './util.ts';

export const REVIEW_COUNT = 3;
export const NEW_COUNT = 2;
export const STRETCH_COUNT = 1;
export const WATCH_COUNT = 3;

/** Scenario suggestions per domain. Extend freely; this is not schema. */
const SCENARIOS: Record<Domain, string[]> = {
  work: ['standup update', 'disagreeing in a meeting', 'asking for a deadline extension',
         'explaining a delay', 'one-on-one with a manager', 'negotiating scope'],
  social: ['small talk at a barbecue', 'catching up with a friend', 'meeting someone new',
           'making plans for the weekend', 'reacting to a story'],
  daily: ['at the pharmacy', 'ordering at a cafe', 'booking an appointment',
          'asking for directions', 'at the supermarket checkout'],
  service: ['returning a faulty item', 'calling about a bill', 'making a complaint politely',
            'chasing up a delayed delivery'],
};

/**
 * The top domain gets roughly half the sessions. A single domain must not
 * starve the rest — fluency that only works at the office is not fluency.
 */
const DOMAIN_WEIGHTS = [0.5, 0.25, 0.15, 0.1];

export interface Briefing {
  date: string;
  scenario: string;
  review: Item[];
  fresh: Item[];
  stretch: Item[];
  watch: Item[];
  backlog: number;
}

export function selectBriefing(items: Item[] = loadAllItems(), date = today()): Briefing {
  const reviewable = items.filter((i) => i.type !== 'mistake');
  const taken = new Set<string>();
  const take = (list: Item[], n: number): Item[] => {
    const picked = list.filter((i) => !taken.has(i.id)).slice(0, n);
    for (const i of picked) taken.add(i.id);
    return picked;
  };

  const due = reviewable
    .filter((i) => i.review_history.length > 0 && i.next_review <= date)
    .sort(
      (a, b) =>
        daysBetween(a.next_review, date) - daysBetween(b.next_review, date) ||
        a.mastery_score - b.mastery_score,
    );

  const fresh = reviewable
    .filter((i) => i.status === 'new')
    .sort((a, b) => domainRank(a) - domainRank(b) || a.first_seen.localeCompare(b.first_seen));

  const stretch = reviewable
    .filter((i) => i.mastery_score < 0.5)
    .sort(
      (a, b) =>
        difficultyRank(b) - difficultyRank(a) ||
        a.mastery_score - b.mastery_score,
    );

  const watch = items
    .filter((i) => i.type === 'mistake')
    .sort((a, b) => b.frequency - a.frequency || a.mastery_score - b.mastery_score)
    .slice(0, WATCH_COUNT);

  return {
    date,
    scenario: suggestScenario(date),
    review: take(due, REVIEW_COUNT),
    fresh: take(fresh, NEW_COUNT),
    stretch: take(stretch, STRETCH_COUNT),
    watch,
    backlog: due.length,
  };
}

function domainRank(item: Item): number {
  const ranks = item.domain.map((d) => DOMAINS.indexOf(d)).filter((r) => r >= 0);
  return ranks.length ? Math.min(...ranks) : DOMAINS.length;
}

function difficultyRank(item: Item): number {
  return { easy: 0, medium: 1, hard: 2 }[item.difficulty];
}

/** Seeded by date so regenerating today's briefing never changes it. */
function suggestScenario(date: string): string {
  const rnd = seededRandom(date);
  const domain = weightedPick(DOMAINS, DOMAIN_WEIGHTS, rnd);
  const options = SCENARIOS[domain];
  return options[Math.floor(rnd() * options.length)] ?? domain;
}

export function renderBriefing(b: Briefing): string {
  const lines: string[] = [
    `# DAILY BRIEFING — ${b.date}`,
    'You are my English coach. Australian English. Push fluency, not perfection.',
    'Weave the items below into natural conversation. NEVER quiz me directly and',
    'never mention this briefing. At the end, output a SESSION REPORT in the',
    'locked format.',
    '',
    `Suggested scenario: ${b.scenario}`,
    '',
  ];

  const section = (heading: string, note: string, items: Item[]) => {
    if (items.length === 0) return;
    lines.push(`## ${heading} ${note}`);
    for (const i of items) lines.push(`- ${i.title} (${i.type})${gloss(i)}`);
    lines.push('');
  };

  section('REVIEW', '(work these in naturally)', b.review);
  section('NEW', '(introduce these)', b.fresh);
  section('STRETCH', '(one hard thing)', b.stretch);

  if (b.watch.length > 0) {
    lines.push('## WATCH FOR (my recurring mistakes)');
    for (const m of b.watch) lines.push(`- ${m.title}`);
    lines.push('');
  }

  if (b.review.length === 0 && b.fresh.length === 0 && b.stretch.length === 0) {
    lines.push('_Nothing scheduled. Free conversation — the coach picks the topic._', '');
  }

  return lines.join('\n');
}

function gloss(item: Item): string {
  const meaning = /^##\s+Meaning\s*$([\s\S]*?)(?=^##\s|\Z)/m.exec(item.body)?.[1]?.trim();
  const firstLine = meaning?.split('\n')[0]?.trim();
  return firstLine ? ` — "${firstLine}"` : '';
}

export function writeBriefing(items?: Item[], date = today()): Briefing {
  const briefing = selectBriefing(items, date);
  writeFile(paths.briefing, renderBriefing(briefing));
  return briefing;
}
