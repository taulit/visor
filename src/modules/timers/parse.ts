/** Parse what the user types after the `timer` keyword. Pure logic. */

export type TimerSpec =
  | { kind: 'countdown'; durationMs: number; label: string }
  | { kind: 'alarm'; at: Date; label: string };

const HOUR_MS = 3_600_000;
const MAX_MS = 24 * HOUR_MS;

type Unit = 'h' | 'm' | 's';
const UNIT_MS: Record<Unit, number> = { h: HOUR_MS, m: 60_000, s: 1000 };
const NEXT_SMALLER: Record<Unit, Unit | undefined> = { h: 'm', m: 's', s: undefined };
const ORDER: Unit[] = ['h', 'm', 's'];

const UNITS: Record<string, Unit> = {
  s: 's', sec: 's', secs: 's', sek: 's', second: 's', seconds: 's', sekunde: 's', sekunden: 's',
  m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm', minuten: 'm',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', std: 'h', stunde: 'h', stunden: 'h',
}; // prettier-ignore

const HOUR_WORD = 'h|hrs?|hours?|std|stunden?';

// `1:30h`: hours and minutes with a trailing hour unit.
const CLOCK_DURATION = new RegExp(`^(\\d+):([0-5]\\d)\\s*(?:${HOUR_WORD})(?![\\p{L}\\d])`, 'iu');
// `18:30`, `6:30 pm`; a letter right behind the minutes (`1:30h`) is not an alarm.
const CLOCK_ALARM = /^(\d{1,2}):([0-5]\d)(?:\s*(am|pm)(?![\p{L}\d]))?(?![\p{L}\d:])/iu;
const MERIDIEM_ALARM = /^(\d{1,2})\s*(am|pm)(?![\p{L}\d])/iu;
// One `25`, `1,5` or `10` with the word behind it, which may be a unit or the start of the label.
const SEGMENT = /(\s*)(\d+(?:[.,]\d+)?)(\s*)(\p{L}+)?/uy;

const cleanLabel = (text: string): string => text.trim().replace(/^[-–—:,]\s*/, '');

function alarmAt(now: Date, hour: number, minute: number): Date {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** To 24-hour clock: 12 am is 0, 12 pm is 12. Null if the hour is no 12-hour clock hour. */
function to24Hour(hour: number, meridiem: string): number | null {
  if (hour < 1 || hour > 12) return null;
  return (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
}

function parseAlarm(text: string, now: Date): TimerSpec | null | undefined {
  const clock = CLOCK_ALARM.exec(text);
  const meridiem = MERIDIEM_ALARM.exec(text);
  const match = clock ?? meridiem;
  if (!match) return undefined; // not alarm syntax at all

  const hourText = match[1] as string;
  const minute = clock ? Number(match[2]) : 0;
  const suffix = (clock ? match[3] : match[2]) as string | undefined;
  const hour = suffix ? to24Hour(Number(hourText), suffix) : Number(hourText);
  if (hour === null || hour > 23) return null;
  return {
    kind: 'alarm',
    at: alarmAt(now, hour, minute),
    label: cleanLabel(text.slice(match[0].length)),
  };
}

function parseCountdown(text: string): TimerSpec | null {
  let total = 0;
  let pos = 0;

  const clock = CLOCK_DURATION.exec(text);
  if (clock) {
    total = (Number(clock[1]) * 60 + Number(clock[2])) * 60_000;
    pos = clock[0].length;
  } else {
    let last: Unit | undefined;
    let count = 0;
    for (;;) {
      SEGMENT.lastIndex = pos;
      const segment = SEGMENT.exec(text);
      if (!segment) break;
      const [whole = '', lead = '', numberText = '', , word] = segment;
      const value = Number(numberText.replace(',', '.'));
      const unit = word ? UNITS[word.toLowerCase()] : undefined;

      if (unit) {
        if (last && ORDER.indexOf(unit) <= ORDER.indexOf(last)) break; // `1h 2h`: not a duration
        total += value * UNIT_MS[unit];
        last = unit;
        pos += whole.length;
      } else {
        // A number without unit: minutes when alone (`45`), or the next smaller unit when it
        // sticks to the previous one (`1h30`). Never a decimal, so `18.30` is not a duration.
        const smaller = last && lead === '' ? NEXT_SMALLER[last] : undefined;
        const bare = count === 0 ? 'm' : smaller;
        if (!bare || !/^\d+$/.test(numberText)) {
          if (count === 0) return null;
          break;
        }
        total += value * UNIT_MS[bare];
        pos += lead.length + numberText.length;
        count++;
        break;
      }
      count++;
    }
    if (count === 0) return null;
  }

  const durationMs = Math.round(total);
  if (!(durationMs > 0) || durationMs > MAX_MS) return null;
  return { kind: 'countdown', durationMs, label: cleanLabel(text.slice(pos)) };
}

/**
 * Parse the arguments of the timer command.
 * Countdowns: `25m Pizza`, `1h30`, `1h 30m`, `1:30h`, `90s`, `45` (minutes), `1,5h`, `10 sekunden`.
 * Alarms: `18:30 Meeting`, `6pm Call`, `6:30 pm`; a time that has passed means tomorrow.
 */
export function parseTimer(args: string, now: Date): TimerSpec | null {
  const text = args.trim();
  if (text === '') return null;
  if (CLOCK_DURATION.test(text)) return parseCountdown(text);
  const alarm = parseAlarm(text, now);
  if (alarm !== undefined) return alarm;
  // `12:60`, `1:30:00`: clock-like but neither a valid time nor a duration.
  return /^\d+:/.test(text) ? null : parseCountdown(text);
}
