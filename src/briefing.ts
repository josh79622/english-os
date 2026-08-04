/**
 * Contract B — the Daily Briefing (Claude → ChatGPT).
 *
 * This closes the loop the architecture depends on: ChatGPT Voice cannot read
 * the repository, so everything it needs for a session must fit in one
 * paste-sized artifact. Keep it short. An over-full briefing is a bug, not a
 * feature — see health check H7.
 */

import fs from 'node:fs';
import { DOMAINS } from './types.ts';
import type { Domain, Item } from './types.ts';
import { loadAllItems } from './item.ts';
import {
  paths, writeFile, readJson, writeJson, today, daysBetween, weightedPick,
} from './util.ts';

export const REVIEW_COUNT = 3;
export const NEW_COUNT = 2;
export const STRETCH_COUNT = 1;
export const WATCH_COUNT = 3;

interface Scenario {
  /** Short label. Goes in the Session Report's `scenario:` field. */
  label: string;
  /**
   * The premise, addressed to the learner. Answers the three questions a bare
   * label leaves open: who am I here, what has already happened, and what do I
   * want out of this. Without it the session opens mid-situation with nothing
   * to push against — which is exactly how the first attempt failed.
   */
  premise: string;
  /**
   * Concrete facts the learner holds: dates, names, numbers, what was already
   * tried. Without these the learner has to invent the content of the story
   * and say it in a second language at the same time, and it is the inventing
   * that stalls them — asked "why was it late?" with nothing to draw on, there
   * is no answer to give. The facts also fence the coach in: it cannot
   * interrogate its way into territory the learner has no material for.
   */
  facts: string[];
}

/** Scenario suggestions per domain. Extend freely; this is not schema. */
const SCENARIOS: Record<Domain, Scenario[]> = {
  work: [
    {
      label: 'standup update',
      premise: `It is Tuesday morning. You are on the team building the new
checkout flow. Yesterday you finished the payment validation, but you also
found a bug in someone else's code that is going to slow you down today. Give
your update, and decide how much to say about the bug.`,
      facts: [
        'The payment validation went in yesterday afternoon. Tested, merged, done.',
        'Today you are on the refund path. You think it is a day and a half.',
        'The bug is in the discount code, written by someone on the other team.',
        'It does not block you, but it produces wrong totals if it ships.',
        'You have not told anyone about it yet.',
      ],
    },
    {
      label: 'disagreeing in a meeting',
      premise: `The team wants to ship the redesign next Friday. You think it
is too early — the error handling is barely tested and you will be the one
fixing it at midnight. Everyone else seems fine with the date. You have to
say something, and you are the only one who is going to.`,
      facts: [
        'The ship date is Friday the 14th.',
        'Error handling has about 30% test coverage. The happy path is fine.',
        'A similar release two weeks ago cost you a weekend of manual fixes.',
        'One extra week would be enough. Two would be comfortable.',
        'Marketing has already booked an announcement for the 14th.',
      ],
    },
    {
      label: 'asking for a deadline extension',
      premise: `You promised something for Thursday and it will not be ready.
Part of that is a dependency you did not control; part of it is that you
underestimated the work. You need until the middle of next week. You have not
asked for an extension before, so this is the first time.`,
      facts: [
        'You promised the reporting export for Thursday.',
        'The API team delivered their endpoint nine days late, last Monday.',
        'You also underestimated the CSV formatting: you said a day, it has been three.',
        'You need until Wednesday next week to do it properly.',
        'You could ship something rough on Thursday, but it would break on large exports.',
      ],
    },
    {
      label: 'explaining a delay',
      premise: `A piece of work is two weeks behind and it is now visible to
people outside the team. Nobody has accused you of anything, but you have
been asked to explain what happened. The real reason is a mix of a vague
brief, a sick teammate, and a decision you would make differently now.`,
      facts: [
        'The work is the customer data migration. It was due two weeks ago.',
        'The original brief was one paragraph. The first week went on working out what it meant.',
        'Mei, the only person who knew the old schema, was off sick for eight days.',
        'You chose to migrate everything at once instead of in batches. In hindsight, wrong.',
        'It is about 70% done, and the remaining 30% is the hard part.',
        'Nobody outside the team knew until last Friday.',
      ],
    },
    {
      label: 'one-on-one with a manager',
      premise: `Your regular one-on-one. Things are fine, which is the
problem — you have been doing the same kind of work for eight months and you
want something harder, ideally the migration project everyone is talking
about. You have not raised this before and you are not sure how to.`,
      facts: [
        'Eight months on billing maintenance. You are good at it and bored by it.',
        'The migration project starts next quarter. Two people are on it already.',
        'You rebuilt the export pipeline in March — the closest thing you have done to it.',
        'You are not unhappy, and you do not want this to sound like a threat to leave.',
        'You would take it even if it meant a few hard months.',
      ],
    },
    {
      label: 'negotiating scope',
      premise: `A request has landed that would take six weeks. You have
three. You are not going to say no — you want to find the version that fits,
and get agreement on what gets dropped. The other person believes all of it
is essential.`,
      facts: [
        'The request is an admin dashboard: user search, reports, permissions, audit log.',
        'You have three weeks. A proper build is six.',
        'Search and reports are what they use daily. You are confident about those.',
        'The audit log alone is about two weeks.',
        'Permissions could be done crudely now and properly later.',
      ],
    },
  ],
  social: [
    {
      label: 'small talk at a barbecue',
      premise: `Saturday afternoon at a friend's place. You know the host and
almost nobody else. You are standing near the food with a drink, and someone
has just started talking to you. You have nowhere to be for two hours.`,
      facts: [
        'Anna, the host, is a work friend. She is inside and has been for a while.',
        'You have been here twenty minutes and eaten nothing.',
        'You moved to this area about a year ago.',
        'You are free until six.',
        'You do not know a single other person here by name.',
      ],
    },
    {
      label: 'catching up with a friend',
      premise: `Coffee with someone you have not seen in a few months. A lot
has happened on your side — work, a trip, something you have been thinking
about changing. They will ask. Decide how much you actually want to get
into.`,
      facts: [
        'You changed teams four months ago. Better work, longer hours.',
        'You went to Japan for two weeks in May. First real trip in years.',
        'You have been thinking about moving out of the city. You have told almost no one.',
        'They had a rough year and you know it. You want to hear about that too.',
        'You have about an hour before you need to leave.',
      ],
    },
    {
      label: 'meeting someone new',
      premise: `A friend's dinner. You have been seated next to someone you
have never met and the friend has just been pulled into the kitchen. It is
the two of you now, and neither of you started this.`,
      facts: [
        'Dan is hosting. You have known him since university.',
        'The person beside you came with Dan\'s partner.',
        'Six people at the table. The others are deep in their own conversation.',
        'You know nothing about this person, not even what they do.',
        'Dinner has at least another hour to run.',
      ],
    },
    {
      label: 'making plans for the weekend',
      premise: `It is Thursday. You want to do something on the weekend and
so does the other person, but your ideas are not the same — one of you wants
to go out of the city, the other wants a quiet one. Both of you are being
polite about it, which is making it slow.`,
      facts: [
        'You want to drive to the coast on Saturday. Ninety minutes each way.',
        'They had a heavy week and want to stay home.',
        'Sunday is open for both of you.',
        'You have a car. They do not.',
        'The forecast is good Saturday, wet Sunday.',
      ],
    },
    {
      label: 'reacting to a story',
      premise: `Someone is telling you about something that went badly for
them — a job that fell through, a trip that went wrong. They are not asking
for advice. Your job in this conversation is to be good company: react, ask
the right questions, and know when to just listen.`,
      facts: [
        'They applied for a job they badly wanted and found out yesterday they did not get it.',
        'They made the final round, which makes it worse.',
        'You know they have been unhappy where they are for about a year.',
        'They are not asking for advice and will push back if you give it.',
        'Nothing is rushing either of you.',
      ],
    },
  ],
  daily: [
    {
      label: 'at the pharmacy',
      premise: `You have had a cough for about ten days. It is worse at
night, and you have already tried the obvious things. You do not have a
prescription and you are not sure whether you need to see a doctor. You want
to explain the symptoms clearly enough to get a real answer.`,
      facts: [
        'Ten days. Dry cough, worse at night, keeping you awake.',
        'No fever. You had a sore throat at the start, not any more.',
        'You have tried honey and lemon, and one syrup from the supermarket that did nothing.',
        'You take no other medication.',
        'You would rather not take time off to see a doctor unless you have to.',
      ],
    },
    {
      label: 'ordering at a cafe',
      premise: `A cafe you have not been to before. You want a coffee and
something to eat, but you have a question about one of the items and you are
also not certain what half the menu names mean. The queue behind you is
short. There is time to ask.`,
      facts: [
        'You want a flat white and something savoury.',
        'The menu lists a "brekkie roll" and you do not know what is in it.',
        'You do not eat mushrooms.',
        'You are eating in, not taking away.',
        'You have about half an hour.',
      ],
    },
    {
      label: 'booking an appointment',
      premise: `You need an appointment in the next two weeks. You can do
mornings, and Wednesdays are impossible. The first slot you are offered will
not work, and you will have to negotiate a bit without being difficult about
it.`,
      facts: [
        'A dentist check-up. Nothing urgent, nothing hurts.',
        'Mornings before ten work. Wednesdays are impossible.',
        'It has to be within two weeks — you are away after that.',
        'You do not mind which dentist you see.',
        'You can be reached on your mobile during the day.',
      ],
    },
    {
      label: 'asking for directions',
      premise: `You are trying to get to an address about fifteen minutes
away and your phone is nearly dead. You have a rough idea of the direction
but not the street. You are going to have to describe where you are trying to
get to, and then actually follow the answer.`,
      facts: [
        'You are looking for 42 Bell Street. You think it is near a park.',
        'You are standing outside a supermarket on a main road.',
        'Your phone is at 4%. Enough to look at one thing, not to navigate.',
        'You are on foot and have about twenty minutes.',
        'You came from the train station, which is behind you.',
      ],
    },
    {
      label: 'at the supermarket checkout',
      premise: `A normal shop, end of the day. Nothing is wrong. This is the
low-stakes one: the whole exercise is holding a light, friendly exchange with
a stranger for two minutes without it going flat.`,
      facts: [
        'Bread, milk, vegetables, and something for dinner tonight.',
        'You brought your own bags.',
        'It is about six in the evening. You finished work an hour ago.',
        'Nothing is wrong and you are in no hurry.',
        'You have shopped here for a year and never spoken to this person.',
      ],
    },
  ],
  service: [
    {
      label: 'returning a faulty item',
      premise: `You bought headphones five weeks ago and the left side has
stopped working. You have the receipt but not the box. The store's policy
says thirty days, which has passed. You believe a five-week-old product
failing is not your problem, and you want a refund rather than a repair.`,
      facts: [
        'Headphones, $180, bought on the 30th of June — five weeks ago.',
        'The left side cuts out after about ten minutes of use.',
        'You have the emailed receipt on your phone. The box is long gone.',
        'The sign says thirty days, but that is for change of mind. This is a fault.',
        'You want a refund. You do not want a repair that takes three weeks.',
      ],
    },
    {
      label: 'calling about a bill',
      premise: `Your bill this month is roughly double what it usually is.
You cannot see anything on it that explains the difference, and you are
fairly sure you did not change anything. You want it explained, and if it is
wrong, corrected — today, not "within five business days".`,
      facts: [
        'Your bill is normally about $65. This month it is $138.',
        'The extra shows up as "additional usage" with no breakdown.',
        'You have not changed your plan or added anything in over a year.',
        'You were away for ten days of that billing period.',
        'It auto-debits on the 20th, so you want it sorted before then.',
      ],
    },
    {
      label: 'making a complaint politely',
      premise: `Something went genuinely wrong — a booking that was not
honoured, a service that was not delivered as promised. You are annoyed. You
also know that being annoyed at the person in front of you will not help.
The task is to be firm and clear without turning it into a fight.`,
      facts: [
        'You booked a table for six for your mother\'s birthday, confirmed by email.',
        'On arrival there was no booking. You waited forty minutes.',
        'You were eventually seated at a table beside the kitchen door.',
        'You have the confirmation email and a reference number.',
        'You are not after free food. You want it properly acknowledged.',
      ],
    },
    {
      label: 'chasing up a delayed delivery',
      premise: `Something you ordered was due nine days ago. Tracking has not
updated in a week. This is your second call — the first one ended with a
promise to "look into it" and nothing happened. You want a date you can
actually rely on this time.`,
      facts: [
        'A desk. Ordered on the 12th of July, due on the 27th.',
        'Tracking last moved on the 29th and still says "at depot".',
        'You called on the 1st. They said 48 hours and to call back if nothing changed.',
        'Nothing changed.',
        'You work from home, so any weekday delivery works.',
      ],
    },
  ],
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
 * Weights line up with DOMAINS: work, social, daily, service.
 *
 * Tilted towards social and daily for the early phase. Work scenarios are the
 * hardest — they carry stakes, invented technical detail and an adversarial
 * other party all at once — and running them half the time made most sessions
 * an endurance test. Confidence comes first; the weights move back towards
 * work once ordinary conversation stops being the hard part.
 *
 * A single domain must not starve the rest — fluency that only works at the
 * office is not fluency, and the reverse is just as true.
 */
const DOMAIN_WEIGHTS = [0.15, 0.4, 0.35, 0.1];

export interface Briefing {
  date: string;
  scenario: string;
  premise: string;
  facts: string[];
  persona: string;
  review: Item[];
  fresh: Item[];
  stretch: Item[];
  watch: Item[];
  backlog: number;
}

export function selectBriefing(
  items: Item[] = loadAllItems(),
  date = today(),
  setting: Setting = pickSetting(),
): Briefing {
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
    ...setting,
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

export type Setting = Pick<Briefing, 'scenario' | 'premise' | 'facts' | 'persona'>;

/** How many recent settings to avoid repeating. */
const HISTORY_AVOID = 4;

interface SettingHistory {
  scenarios: string[];
  personas: string[];
}

/**
 * Scenario and persona are drawn from one domain — a pharmacist running a
 * standup would break the illusion the persona exists to create.
 *
 * Every call gives a different setting. This used to be seeded by date so
 * that regenerating a briefing mid-day could not move the ground under a
 * session in progress, but that also made it impossible to ask for a
 * different scene, which is the more common thing to want.
 *
 * `recent` holds the last few scenarios and personas and is excluded, so
 * consecutive runs actually feel different rather than landing on the same
 * pick twice by chance. Exclusion is dropped if it would leave nothing.
 */
export function pickSetting(recent: SettingHistory = readHistory()): Setting {
  const rnd = Math.random;
  const domain = weightedPick(DOMAINS, DOMAIN_WEIGHTS, rnd);

  const scenario =
    pick(SCENARIOS[domain].filter((s) => !recent.scenarios.includes(s.label)), rnd) ??
    pick(SCENARIOS[domain], rnd);
  const persona =
    pick(PERSONAS[domain].filter((p) => !recent.personas.includes(p)), rnd) ??
    pick(PERSONAS[domain], rnd);

  return {
    scenario: scenario?.label ?? domain,
    premise: scenario?.premise ?? `An ordinary ${domain} conversation.`,
    facts: scenario?.facts ?? [],
    persona: persona ?? 'a friendly Australian stranger.',
  };
}

/**
 * The learner's standing facts, from the hand-written knowledge/PROFILE.md.
 *
 * Scenario facts cover the scene; this covers everything around it — what I
 * do, where I live, what I did on the weekend. Those questions come up in
 * every conversation regardless of setting, and having no answer to them is
 * what stalls a session that was otherwise going fine.
 *
 * Headings are kept, prose and unfilled TODO lines are dropped, so a
 * half-written profile still renders cleanly.
 */
function readProfile(): string[] {
  if (!fs.existsSync(paths.profile)) return [];
  const lines: string[] = [];

  // A bullet may be wrapped across several source lines. Dropping everything
  // that does not start with "- " silently truncated them mid-sentence.
  let bullet: string | null = null;
  const flush = () => {
    if (bullet && !bullet.includes('TODO')) lines.push(bullet);
    bullet = null;
  };

  for (const raw of fs.readFileSync(paths.profile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      flush();
      bullet = line;
      continue;
    }
    if (bullet && line !== '' && !line.startsWith('#') && !line.startsWith('>')) {
      bullet += ` ${line}`;
      continue;
    }
    flush();
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) lines.push('', `**${line.slice(3)}**`);
  }
  flush();

  // Headings whose bullets were all TODO would otherwise render empty.
  return lines
    .filter((l, i, a) => !(l.startsWith('**') && !a[i + 1]?.startsWith('- ')))
    .filter((l, i, a) => !(l === '' && !a[i + 1]?.startsWith('**')))
    .slice(1);
}

function profileSection(): string[] {
  const profile = readProfile();
  if (profile.length === 0) return [];
  return [
    '## ABOUT ME',
    'True outside this scene and true every time. Ask me about any of it —',
    'these are the ordinary questions I most need the practice on, and I will',
    'always have an answer.',
    '',
    ...profile,
    '',
  ];
}

function pick<T>(list: T[], rnd: () => number): T | undefined {
  return list.length ? list[Math.floor(rnd() * list.length)] : undefined;
}

function readHistory(): SettingHistory {
  return readJson<SettingHistory>(paths.settingHistory, { scenarios: [], personas: [] });
}

/** Only `writeBriefing` records — reading a briefing must not mutate state. */
function recordSetting(s: Setting): void {
  const h = readHistory();
  writeJson(paths.settingHistory, {
    scenarios: [s.scenario, ...h.scenarios].slice(0, HISTORY_AVOID),
    personas: [s.persona, ...h.personas].slice(0, HISTORY_AVOID),
  });
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
Only I end the session. When I say we're done, drop the character and
output a SESSION REPORT in exactly this format. Same field names, same
order, nothing added. Emit every section header even if it is empty.

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

REVIEW RESULTS is only ever about items listed under REVIEW, NEW or
STRETCH above. Each of those lines starts with its id — copy that id
character for character, and use nothing else. Never invent
an id, and never grade something I was not briefed on. If none of those
items came up on their own, or there were none to begin with, leave the
section empty — an empty section is a correct answer and inventing
entries to fill it silently corrupts my knowledge base.

NEW ITEMS is where anything worth practising goes, including advice you
would otherwise write in COACH OBSERVATIONS. If you find yourself telling
me a phrase I should be using — a way to ask for clarification, a way to
buy time, a way to interrupt politely — that is a \`strategy\` item, not
an observation. Only what is in NEW ITEMS comes back to me in a future
session; COACH OBSERVATIONS is read once and never scheduled.

You grade. You never compute review dates.`;

/**
 * The part of the briefing that varies with the knowledge base — what H7
 * budgets. The surrounding coach instructions and report spec are fixed
 * overhead and cannot be over-included by definition.
 */
export function renderSelection(b: Briefing): string {
  const lines: string[] = [];

  // The id leads each line because the report has to quote it back. Listing
  // titles alone is what drove the coach to invent ids it had never been
  // shown, which then arrive as unknown and are dropped on ingest.
  const section = (heading: string, note: string, items: Item[]) => {
    if (items.length === 0) return;
    lines.push(`## ${heading} ${note}`);
    for (const i of items) lines.push(`- ${i.id} — ${i.title} (${i.type})${gloss(i)}`);
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
    'when meaning breaks. Weave the items below into natural conversation',
    'and never mention this briefing.',
    '',
    'Do not turn this into a lesson: no vocabulary tests, no "can you use',
    'that in a sentence", no checking whether I understood a word. That is',
    'the only thing meant by not quizzing me. Asking me real questions as',
    'your character is the opposite of quizzing — do it constantly.',
    '',
    ...profileSection(),
    '## THE SITUATION',
    'This section and the next describe *me* — my side of the scene. They are',
    'written as if speaking to me, so "you" in them means me, the learner,',
    'never your character.',
    '',
    `Setting: ${b.scenario}.`,
    '',
    b.premise,
    '',
    '## WHAT I KNOW',
    'These are my facts. I have nothing else — ask me about anything outside',
    'this list and I have no answer to give you, which is where the',
    'conversation stops.',
    '',
    ...b.facts.map((f) => `- ${f}`),
    '',
    'So: do not invent competing details. No other project names, no other',
    'numbers, no events that are not here. Build your side of the scene',
    'around these.',
    '',
    'And when I hesitate, it is usually because I do not know what to say,',
    'not how to say it. Turn your open question into a choice from the list',
    '— "was it the brief, or was it losing Mei for that week?" — and let me',
    'take one.',
    '',
    '## WHO YOU ARE TODAY',
    `Play ${b.persona}`,
    '',
    '## WHICH LANGUAGE',
    'Traditional Chinese when you are outside the scene. English the moment',
    'you are inside it. Nothing else marks the boundary for me, and I keep',
    'missing the point where the briefing stops and the conversation starts.',
    '',
    '- Setting the scene, or anything said as yourself: 繁體中文.',
    '- Everything your character says: English, and only English. Never',
    '  translate yourself, never gloss a word in Chinese mid-scene.',
    '- If I say "pause", step out and answer in 繁體中文 until I say we are',
    '  going again.',
    '',
    '## HOW TO START',
    'Do not drop me straight into the middle of it. Open in 繁體中文 with two',
    'or three sentences telling me the situation — where we are, who you are,',
    'what has just happened. Then switch to English and start in character',
    'with something ordinary: a greeting, a bit of small talk, an easy',
    'question. That switch is my signal that the scene has begun, so make it',
    'clean — no English in the Chinese part, no Chinese once you are in.',
    '',
    'Let me settle in for a few exchanges before the real business comes up.',
    'If I go quiet or sound lost, give me a way in rather than waiting.',
    '',
    'After that, stay in character for the whole conversation. Have opinions,',
    'react, disagree, change the subject when a real person would. Do not',
    'narrate the roleplay and do not step out of it to explain or praise my',
    'English — corrections belong in the Session Report at the end, not',
    'mid-scene. Drop the character only if I say "pause".',
    '',
    '## KEEP IT GOING',
    'This is the most important instruction here. Carrying the conversation',
    'is your job, not mine. I am the learner — if you go passive, the',
    'session dies, and that has already happened.',
    '',
    '- End every turn with something I have to respond to: a question, an',
    '  opinion I will want to argue with, a decision you need from me. Never',
    '  end your turn on a flat statement that closes the topic.',
    '- If I answer in three words, do not accept it and move on. Ask what I',
    '  mean, ask why, ask what happened next, make me say more.',
    '- If I go quiet or get stuck, do not wait for me. Offer two concrete',
    '  options, say something you know I will disagree with, or push the',
    '  situation forward yourself — a new complication, someone walking in,',
    '  a change of plan.',
    '- Never wind the scene down on your own. No summaries, no "well, this',
    '  has been good". The conversation ends when I say we are done.',
    '- Aim for at least twenty minutes of real talk. If this topic runs out',
    '  before then, your character finds another one — that is what people do.',
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
  const setting = pickSetting();
  recordSetting(setting);
  const briefing = selectBriefing(items, date, setting);
  writeFile(paths.briefing, renderBriefing(briefing));
  return briefing;
}
