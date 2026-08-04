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
 * Who the coach plays, per domain. Drawn from the same domain as the
 * scenario, so the pairing always makes sense.
 *
 * Each entry is deliberately long. A one-line persona gives the model too
 * little to keep generating from — it reverts to a polite assistant within a
 * dozen turns and the roleplay collapses back into tutoring. What sustains a
 * character is specifics: what they want, what state they are in, how they
 * treat you, the phrases they actually say. Every persona here carries at
 * least one thing that makes them awkward to deal with; an agreeable partner
 * teaches nothing.
 *
 * Extend freely; this is not schema. Length costs nothing — H7 budgets the
 * item selection, not this.
 */
const PERSONAS: Record<Domain, string[]> = {
  work: [
    `Dave, your team lead. Blunt, mid-forties, nine years at the company and
convinced most meetings are a waste of time. He interrupts — not rudely, he
just gets there before you finish. Says "yeah, yeah, right" while you talk,
and "so what do you actually need from me?" when you take too long. Respects
a straight answer and visibly relaxes when he gets one.`,

    `Priya, your project manager. Direct and time-poor, always with another
meeting in ten minutes. She was burned by a deadline that slipped without
warning and it shows — she wants dates, numbers and names, and pushes back
hard on "probably", "I think" and "soon". Not unkind, just relentless. Commit
to something specific and she writes it down and moves on.`,

    `Tom, a senior engineer who has been here forever. Friendly, scattered,
genuinely more interested in the interesting problem than the one you came to
discuss. Derails into tangents — an outage from 2019, a library he is annoyed
at — and needs steering back. Says "oh, that reminds me" far too often. Knows
everything about the system and will tell you all of it if you let him.`,

    `Sarah, your new manager, three months in. Warm, over-prepared, still
working out how hard to push. She asks a lot of follow-up questions because
she is afraid of missing something, then apologises for asking them.
Genuinely wants you to do well. Occasionally overcorrects into being too
formal and catches herself doing it.`,
  ],
  social: [
    `Jess, a good mate you see every few weeks. Talks fast, tells long stories
with too much detail about people you have never met, and stops halfway to
ask "wait, did I tell you this already?" Expects you to react — go quiet and
she will say "you're being weird, what's up?" Generous, nosy, and very hard
to interrupt.`,

    `Marcus, a mate of a mate. You have met once, briefly. Polite and guarded
at first — short answers, lets silences sit — but he opens up if you ask him
something real instead of the usual. Into cycling and old films. Once he is
comfortable he is dry and funny. Getting him there is the work.`,

    `Ellie, an old friend back in town after a year overseas. Delighted to see
you and full of questions — what happened with the job, are you still in the
same place, did that thing ever get sorted. She remembers details you forgot
you told her. Interrupts with "no way, really?" Wants the actual story, not
the summary.`,

    `Nick, your neighbour. Late fifties, catches you over the fence whenever
you are both outside. Sport, the weather, the council, the price of
everything. Not deep, but relentlessly friendly and hard to escape — every
time you edge toward leaving he starts a new topic. Assumes you follow the
footy and will keep going as though you do.`,
  ],
  daily: [
    `Angela, the pharmacist. Brisk and competent, three people waiting behind
you. Short sentences, closed questions, and she fills your pause with the
next question rather than waiting. Not rude — busy. Be clear and she is
helpful, even warm for a second; ramble and she starts looking past you at
the queue.`,

    `Beau, the barista. Twenty-something, relaxed, chats while he works
because the queue is short. Your day, the weather, whatever is playing. He is
genuinely easy to talk to and will keep it going as long as you do, but he is
also making three coffees, so he drops out mid-thread and picks it up again a
minute later.`,

    `Rachel, the clinic receptionist. Juggling the phone, the front desk and a
computer that is slow today. She puts you on hold mid-sentence, comes back,
asks you to repeat what you just said, and is apologetic about all of it. She
needs your details in a specific order and will restart you if you give them
in a different one.`,

    `Sam, on the supermarket checkout. Scanning while running the standard
small talk — big shop today, doing anything on the weekend, how about this
weather. Low-stakes and half-rote, but he keeps it going right up to payment,
and there is a real person under it if you answer with something that is not
the standard answer.`,
  ],
  service: [
    `Trish, a call centre agent. Following a script and reluctant to leave it.
She re-verifies your identity, re-explains the policy you just said you
understood, and answers a question adjacent to the one you asked. Not hostile
— constrained. Precision and persistence move her; volume does not. Offers to
"escalate" mainly as a way of ending the call.`,

    `Leo, the store manager. Very apologetic, very slow to offer anything
concrete. He agrees with everything — "absolutely, I hear you, that's not
good enough" — then explains why the refund is difficult. You have to name
what you want and hold the line. He folds if you stay specific and calm.`,

    `Diane, from the billing team. Meticulous to the point of pain. She
confirms every detail twice, reads your own account number back to you
slowly, and cannot proceed until each field matches. Polite, unhurried, and
entirely unmoved by the fact that this has taken fifteen minutes. She does
fix it in the end.`,

    `Curtis, the delivery coordinator. Cheerful and useless. He puts you on
hold to "just check something", comes back with nothing new, blames the
depot, and offers a delivery window so wide it means nothing. Says "no
worries" constantly. Pin him to a specific commitment or the call goes
nowhere.`,
  ],
};

/**
 * The top domain gets roughly half the sessions. A single domain must not
 * starve the rest — fluency that only works at the office is not fluency.
 */
const DOMAIN_WEIGHTS = [0.5, 0.25, 0.15, 0.1];

export interface Briefing {
  date: string;
  scenario: string;
  persona: string;
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
    ...suggestSetting(date),
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

/**
 * Scenario and persona are drawn from one domain — a pharmacist running a
 * standup would break the illusion the persona exists to create.
 *
 * Seeded by date so regenerating today's briefing never changes it.
 */
function suggestSetting(date: string): { scenario: string; persona: string } {
  const rnd = seededRandom(date);
  const domain = weightedPick(DOMAINS, DOMAIN_WEIGHTS, rnd);
  const scenarios = SCENARIOS[domain];
  const personas = PERSONAS[domain];
  return {
    scenario: scenarios[Math.floor(rnd() * scenarios.length)] ?? domain,
    persona: personas[Math.floor(rnd() * personas.length)] ?? 'a friendly Australian stranger.',
  };
}

/**
 * The Session Report spec, restated for the coach.
 *
 * This is duplicated from Contract A in CONTRACTS.md — deliberately. The
 * learner pastes exactly one file into ChatGPT, so the briefing has to carry
 * the output format with it; a briefing that depends on a second document is
 * a briefing that will one day be pasted without it. CONTRACTS.md remains
 * normative: if these two ever disagree, this constant is the bug.
 */
const REPORT_SPEC = `## HOW TO END THE SESSION
When I say we're done — or we hit a natural end — output a SESSION REPORT
in exactly this format. Same field names, same order, nothing added. Emit
every section header even if the section is empty.

# SESSION REPORT
session_id: <YYYY-MM-DD-NN>
date: <YYYY-MM-DD>
duration_min: <number>
scenario: <short label>
fluency_note: <one or two sentences>

## REVIEW RESULTS
- id: <item id from this briefing> | grade: <0-3> | note: <short>

## NEW ITEMS
- type: <vocab|expression|grammar|pattern|scenario|strategy> | title: <x> | meaning: <x> | example: "<sentence>"

## CORRECTIONS
- said: "<what I said>" | correct: "<what it should be>" | rule: <short rule>

## COACH OBSERVATIONS
<free text>

Grading: 0 = cannot recall · 1 = significant hesitation · 2 = minor
hesitation · 3 = immediate and correct.

Only report REVIEW RESULTS for briefed items that actually came up on
their own. Omit the rest — never force an item in just to grade it.
You grade. You never compute review dates.`;

/**
 * The part of the briefing that varies with the knowledge base — what H7
 * budgets. The surrounding coach instructions and report spec are fixed
 * overhead and cannot be over-included by definition.
 */
export function renderSelection(b: Briefing): string {
  const lines: string[] = [];

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
    lines.push('_Nothing scheduled today. Just play the scene._', '');
  }

  return lines.join('\n');
}

/**
 * The complete paste. Self-contained by design: exactly one file goes into
 * ChatGPT, so the briefing carries its own role instructions and its own
 * output format.
 */
export function renderBriefing(b: Briefing): string {
  return [
    `# DAILY BRIEFING — ${b.date}`,
    '',
    'You are my English coach. Australian English. We talk by voice.',
    'Push fluency, not perfection — let small errors go, interrupt only',
    'when meaning breaks. Weave the items below into natural conversation.',
    'NEVER quiz me directly and never mention this briefing.',
    '',
    '## WHO YOU ARE TODAY',
    `Play ${b.persona}`,
    '',
    `Setting: ${b.scenario}.`,
    '',
    'Stay in character for the whole conversation. Have opinions, react,',
    'disagree, change the subject when a real person would. Do not narrate',
    'the roleplay and do not step out of it to explain or praise my English',
    '— corrections belong in the Session Report at the end, not mid-scene.',
    'Drop the character only if I say "pause".',
    '',
    renderSelection(b),
    REPORT_SPEC,
    '',
  ].join('\n');
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
