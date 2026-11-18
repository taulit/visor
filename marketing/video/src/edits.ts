// The two edits: the long one for Reddit (16:9 and square) and the short reel
// (9:16). Times come from the markers of the recordings.
import { markers } from './markers';
import type { Rect, ShotSpec } from './Shot';

export type Card = { kind: 'title' | 'outro'; seconds: number };
export type Part = ShotSpec | Card;

const { intro: i, search: s, t3 } = markers;

// Rectangles of the 3200x1800 recording (the open panel spans x 636–2560).
const FULL: Rect = [0, 0, 3200, 1800];
const NOTCH: Rect = [1000, 0, 1200, 675];
const PANEL: Rect = [400, 0, 2400, 1350];
const NOW: Rect = [560, 0, 1900, 1069];
const RESULTS: Rect = [600, 0, 1500, 844];
// The rows of the T3 Code module come after the built-in ones, low in Now.
const T3_ROW: Rect = [560, 420, 1900, 1069];

// For the tall box of the reel.
const V_NOTCH: Rect = [1100, 0, 1000, 1000];
const V_PEEK: Rect = [860, 0, 1480, 1480];
const V_NOW: Rect = [626, 0, 980, 980];
const V_NEXT: Rect = [1580, 0, 980, 980];
const V_T3: Rect = [626, 420, 980, 980];
const V_SEARCH: Rect = [626, 0, 980, 980];

/** One query of the search clip, from the first key to the held result. */
const query = (n: number, text: string, rect: Rect, trimEnd = 0): ShotSpec => {
  const m = s as Record<string, number>;
  return {
    kind: 'shot',
    clip: 'search',
    from: m[`q${n}_type`]! - 0.15,
    to: m[`q${n}_done`]! - trimEnd,
    cams: [{ at: 0, rect }],
    captions: [{ at: 0, text }],
  };
};

export const long: Part[] = [
  { kind: 'title', seconds: 2.4 },
  {
    kind: 'shot',
    clip: 'intro',
    from: 0.5,
    to: i.close + 0.9,
    cams: [
      { at: 0, rect: FULL },
      { at: i.peek - 0.5, rect: NOTCH, dur: 0.9 },
      { at: i.open + 0.05, rect: PANEL, dur: 0.7 },
      { at: i.open + 2.2, rect: NOW, dur: 0.9 },
      { at: i.close - 0.3, rect: NOTCH, dur: 0.8 },
    ],
    captions: [
      { at: 0.5, text: 'Visor puts a notch in the GNOME top bar' },
      { at: i.peek, text: 'It rests as the clock and peeks out when something happens' },
      { at: i.open + 0.3, text: 'Open it: what plays, runs and waits, and what comes next' },
      {
        at: i.open + 2.4,
        text: '**Media**, **timers**, **downloads** and **agents** in one place',
      },
    ],
  },
  {
    kind: 'shot',
    clip: 'search',
    from: s.open - 0.1,
    to: s.q0_done,
    cams: [
      { at: 0, rect: PANEL },
      { at: s.q0_type, rect: RESULTS, dur: 0.7 },
    ],
    captions: [
      { at: 0, text: 'One search field' },
      { at: s.q0_type + 0.3, text: '**Calculate**' },
    ],
  },
  query(1, '**Convert currencies** (daily ECB rates)', RESULTS),
  query(2, '**Time zones**', RESULTS),
  query(3, '**Units**', RESULTS),
  query(4, '**Launch apps**', RESULTS),
  {
    kind: 'shot',
    clip: 'search',
    from: s.q5_type - 0.15,
    to: s.q5_done + 0.4,
    cams: [{ at: 0, rect: RESULTS }],
    captions: [{ at: 0, text: '**Start a timer** in plain words' }],
  },
  {
    kind: 'shot',
    clip: 'search',
    from: s.reopen - 0.1,
    to: s.reopen + 2.9,
    cams: [
      { at: 0, rect: PANEL },
      { at: s.reopen + 0.8, rect: NOW, dur: 0.9 },
    ],
    captions: [{ at: s.reopen, text: '…and it counts down in **Now**' }],
  },
  {
    kind: 'shot',
    clip: 't3',
    from: t3.ask - 0.6,
    to: t3.close + 0.9,
    cams: [
      { at: 0, rect: NOTCH },
      { at: t3.open + 0.05, rect: PANEL, dur: 0.7 },
      { at: t3.unfold + 0.1, rect: T3_ROW, dur: 0.8 },
      { at: t3.close - 0.3, rect: NOTCH, dur: 0.8 },
    ],
    captions: [
      { at: t3.ask - 0.6, text: 'Your coding agent needs an approval?' },
      { at: t3.ask + 0.4, text: 'The notch lights up' },
      { at: t3.open + 0.2, text: 'See what it wants to run' },
      { at: t3.allow - 0.4, text: '**Allow** it right from the top bar' },
      { at: t3.close, text: 'With the **T3 Code** module for Visor' },
    ],
  },
  { kind: 'outro', seconds: 3.6 },
];

export const reel: Part[] = [
  { kind: 'title', seconds: 1.6 },
  {
    kind: 'shot',
    clip: 'intro',
    from: i.peek - 0.4,
    to: i.open + 3.1,
    cams: [
      { at: 0, rect: V_NOTCH },
      { at: i.open + 0.05, rect: V_NOW, dur: 0.7 },
      { at: i.open + 1.9, rect: V_NEXT, dur: 0.9 },
    ],
    captions: [
      { at: 0, text: 'A notch for GNOME Shell' },
      { at: i.open + 0.2, text: 'Media, timers, agents…' },
      { at: i.open + 1.9, text: '…and what comes next' },
    ],
  },
  {
    kind: 'shot',
    clip: 'search',
    from: s.q0_type - 0.15,
    to: s.q0_done - 0.6,
    cams: [{ at: 0, rect: V_SEARCH }],
    captions: [{ at: 0, text: '**Calculate**' }],
  },
  query(1, '**Convert**', V_SEARCH, 0.8),
  query(5, '**Start timers**', V_SEARCH, 0.3),
  {
    kind: 'shot',
    clip: 't3',
    from: t3.ask - 0.3,
    to: t3.open + 1.4,
    cams: [
      { at: 0, rect: V_PEEK },
      { at: t3.open + 0.05, rect: V_T3, dur: 0.9 },
    ],
    captions: [{ at: 0, text: 'Your AI agent needs you?' }],
  },
  {
    kind: 'shot',
    clip: 't3',
    from: t3.unfold + 0.9,
    to: t3.allow + 2.0,
    cams: [{ at: 0, rect: V_T3 }],
    captions: [{ at: 0, text: '**Allow** it from the top bar' }],
  },
  { kind: 'outro', seconds: 2.6 },
];
