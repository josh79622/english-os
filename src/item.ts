/**
 * Item files are the single source of truth. This module is the only place
 * that knows how they are stored on disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ITEM_TYPES, DOMAINS } from './types.ts';
import type { Domain, Item, ItemMeta, ItemType } from './types.ts';
import { paths, writeFile, isIsoDate, slugify } from './util.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const REQUIRED_FIELDS = [
  'id', 'type', 'title', 'domain', 'tags',
  'first_seen', 'last_seen',
  'interval', 'ease', 'last_review', 'next_review', 'review_history',
  'mastery_score', 'status', 'difficulty', 'frequency',
] as const;

export class ItemError extends Error {}

export function itemPath(item: Pick<Item, 'id' | 'type'>): string {
  return path.join(paths.items, item.type, `${item.id}.md`);
}

export function makeId(type: ItemType, title: string): string {
  return `${type}-${slugify(title)}`;
}

export function parseItem(text: string, source = '<memory>'): Item {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new ItemError(`${source}: missing YAML frontmatter`);

  const data = YAML.parse(match[1] ?? '') as Record<string, unknown>;
  if (data === null || typeof data !== 'object') {
    throw new ItemError(`${source}: frontmatter is not a mapping`);
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) throw new ItemError(`${source}: missing field \`${field}\``);
  }
  if (!ITEM_TYPES.includes(data['type'] as ItemType)) {
    throw new ItemError(`${source}: unknown type \`${String(data['type'])}\``);
  }
  if (!isIsoDate(data['next_review'])) {
    throw new ItemError(`${source}: next_review must be YYYY-MM-DD`);
  }

  return { ...(data as unknown as ItemMeta), body: (match[2] ?? '').trim() };
}

export function serialiseItem(item: Item): string {
  const { body, ...meta } = item;

  // Explicit key order: stable diffs matter more than convenience here.
  const ordered: Record<string, unknown> = {};
  const order: (keyof ItemMeta)[] = [
    'id', 'type', 'title', 'domain', 'scenario', 'tags',
    'first_seen', 'last_seen',
    'interval', 'ease', 'last_review', 'next_review', 'review_history',
    'mastery_score', 'status', 'difficulty', 'frequency',
  ];
  for (const key of order) ordered[key] = meta[key];

  const yaml = YAML.stringify(ordered, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}

export function loadItem(file: string): Item {
  return parseItem(fs.readFileSync(file, 'utf8'), path.relative(paths.items, file));
}

export function loadAllItems(): Item[] {
  if (!fs.existsSync(paths.items)) return [];
  const files = fs
    .readdirSync(paths.items, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(paths.items, f));
  return files.map(loadItem).sort((a, b) => a.id.localeCompare(b.id));
}

export function saveItem(item: Item): void {
  writeFile(itemPath(item), serialiseItem(item));
}

/**
 * Assign a domain when the coach did not supply one. Falls back to the
 * top-priority domain rather than guessing — a wrong-but-consistent default
 * is easy to spot and fix; a randomly-scattered one is not.
 */
export function inferDomain(scenario: string | null): Domain {
  const map: Record<string, Domain> = {
    workplace: 'work', meeting: 'work', standup: 'work', interview: 'work',
    negotiation: 'work', email: 'work',
    deadline: 'work', delay: 'work', scope: 'work', 'one-on-one': 'work',
    // Counter-side shifts before the generic social keys: "small talk on the
    // register" is the learner at work, not at a party.
    register: 'daily', customer: 'daily', directions: 'daily',
    pharmacy: 'daily', shop: 'daily', supermarket: 'daily', transport: 'daily',
    cafe: 'daily', doctor: 'daily', appointment: 'daily',
    complaint: 'service', 'phone call': 'service', bank: 'service',
    council: 'service', support: 'service',
    delivery: 'service', bill: 'service', refund: 'service', faulty: 'service',
    pub: 'social', party: 'social', 'small talk': 'social', friends: 'social',
    weekend: 'social', barbecue: 'social', story: 'social', friend: 'social',
  };
  // Substring, not exact: the scenario labels that actually reach here are
  // phrases — "at the pharmacy", "standup update" — and an exact lookup
  // matched none of them, silently tagging every new item as `work`.
  const key = (scenario ?? '').toLowerCase().trim();
  if (!key) return DOMAINS[0];
  for (const [word, domain] of Object.entries(map)) {
    if (key.includes(word)) return domain;
  }
  return DOMAINS[0];
}
