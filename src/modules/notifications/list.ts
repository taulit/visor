/** Which notifications the section shows, in which order, and their texts. Pure logic. */
import { truncate } from '../../lib/format.js';

/** Rows shown before "Show all". */
export const COLLAPSED_ROWS = 3;
/** From this many notifications of one app on, the full list keeps them together. */
const GROUP_FROM = 3;
const FLASH_MAX_CHARS = 40;
/** About what fits on the line below the title, next to the time. */
const ONE_LINE_CHARS = 44;

export interface Listed {
  /** Name of the app or source the notification came from. */
  app: string;
  /** When it arrived or last changed, in milliseconds. */
  time: number;
}

/** Newest first; of two with the same time the one that came later in the list is first. */
export function newestFirst<T extends Listed>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.time - a.item.time || b.index - a.index)
    .map(entry => entry.item);
}

/**
 * The rows to show. Collapsed: the three newest. Expanded: all of them, newest
 * first, where an app with more than two notifications has them in one block
 * at the place of its newest one.
 */
export function arrange<T extends Listed>(items: readonly T[], expanded: boolean): T[] {
  const sorted = newestFirst(items);
  if (!expanded) return sorted.slice(0, COLLAPSED_ROWS);

  const counts = new Map<string, number>();
  for (const item of sorted) counts.set(item.app, (counts.get(item.app) ?? 0) + 1);
  const placed = new Set<string>();
  const result: T[] = [];
  for (const item of sorted) {
    if ((counts.get(item.app) ?? 0) < GROUP_FROM) {
      result.push(item);
    } else if (!placed.has(item.app)) {
      placed.add(item.app);
      result.push(...sorted.filter(other => other.app === item.app));
    }
  }
  return result;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** The body as plain text. Apps may send the small markup of the notification spec: tags go, entities are read. */
export function plainBody(body: string | null | undefined, markup: boolean): string {
  const text = body ?? '';
  if (!markup) return text.trim();
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^<>]*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      const lower = name.toLowerCase();
      if (lower.startsWith('#x'))
        return String.fromCodePoint(parseInt(lower.slice(2), 16) || 0xfffd);
      if (lower.startsWith('#'))
        return String.fromCodePoint(parseInt(lower.slice(1), 10) || 0xfffd);
      return ENTITIES[lower] ?? match;
    })
    .trim();
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The line below the title: `App · body`, the body on one line. */
export function subtitleText(app: string, body: string): string {
  return [oneLine(app), oneLine(body)].filter(Boolean).join(' · ');
}

/** True when the row should open up: it has buttons, or more text than one line holds. */
export function needsExpand(app: string, body: string, actions: number): boolean {
  if (actions > 0) return true;
  const trimmed = body.trim();
  return trimmed.includes('\n') || subtitleText(app, trimmed).length > ONE_LINE_CHARS;
}

/** The text of the chip that announces a notification: `App: title`. */
export function flashText(app: string, title: string): string {
  const name = oneLine(app);
  const text = oneLine(title);
  return truncate(name && text ? `${name}: ${text}` : name || text, FLASH_MAX_CHARS);
}
