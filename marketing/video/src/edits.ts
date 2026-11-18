// The two edits: the long one for Reddit (16:9 and square) and the short reel
// (9:16). Times come from the markers of the recordings.
//
// Calm on purpose: one framing per shot and at most one slow camera move, so
// the notch and its animation can be watched rather than chased.
import { markers } from './markers';
import type { Rect, ShotSpec } from './Shot';

export type Card = { kind: 'title' | 'outro'; seconds: number };
export type Part = ShotSpec | Card;

const { intro: i, search: s, t3 } = markers;

// Rectangles of the 2560x1440 recording. The open panel spans x 316–2244 and
// reaches y 882; with a T3 Code row unfolded it reaches y 1262.
const FULL: Rect = [0, 0, 2560, 1440];
const PANEL: Rect = [240, 0, 2080, 1170];
// The rows of the T3 Code module come after the built-in ones, low in Now.
const PANEL_LOW: Rect = [240, 270, 2080, 1170];

// For the square box of the reel.
const V_CENTER: Rect = [580, 0, 1400, 1400];
const V_LEFT: Rect = [300, 0, 1120, 1120];
const V_T3: Rect = [300, 300, 1120, 1120];

export const long: Part[] = [
  { kind: 'title', seconds: 2.6 },
  {
    kind: 'shot',
    clip: 'intro',
    from: 0.6,
    to: i.close + 2.0,
    cams: [
      { at: 0, rect: FULL },
      // One slow push in while the chips peek out; the panel then opens in a still frame.
      { at: i.peek - 0.6, rect: PANEL, dur: 2.4 },
    ],
    captions: [
      { at: 0.6, text: 'Visor turns the GNOME clock into a notch' },
      { at: i.peek + 0.4, text: 'It peeks out when something happens' },
      { at: i.open + 0.8, text: 'Open it: what plays, runs and waits, and what comes next' },
    ],
  },
  {
    kind: 'shot',
    clip: 'search',
    from: s.open - 0.5,
    to: s.reopen + 3.6,
    cams: [{ at: 0, rect: PANEL }],
    captions: [
      { at: s.open - 0.5, text: 'One search field' },
      { at: s.q0_type + 0.4, text: '**Convert** and calculate as you type' },
      { at: s.q1_type + 0.4, text: 'Start a **timer** in plain words' },
      { at: s.reopen + 0.3, text: '…and it counts down in **Now**' },
    ],
  },
  {
    kind: 'shot',
    clip: 't3',
    from: t3.ask - 1.0,
    to: t3.close + 2.2,
    cams: [
      { at: 0, rect: PANEL },
      { at: t3.unfold, rect: PANEL_LOW, dur: 1.6 },
    ],
    captions: [
      { at: t3.ask + 0.2, text: 'Your coding agent needs an approval? The notch lights up' },
      { at: t3.open + 0.6, text: 'See what it wants to run' },
      { at: t3.allow - 0.8, text: '**Allow** it right from the top bar' },
      { at: t3.close + 0.2, text: 'With the **T3 Code** module for Visor' },
    ],
  },
  { kind: 'outro', seconds: 4 },
];

export const reel: Part[] = [
  { kind: 'title', seconds: 1.6 },
  {
    kind: 'shot',
    clip: 'intro',
    from: i.peek - 1.2,
    to: i.open + 2.8,
    cams: [{ at: 0, rect: V_CENTER }],
    captions: [
      { at: 0, text: 'A notch for GNOME Shell' },
      { at: i.open + 0.2, text: 'What plays, runs and waits' },
    ],
  },
  {
    kind: 'shot',
    clip: 'search',
    from: s.q0_type - 0.3,
    to: s.q0_done,
    cams: [{ at: 0, rect: V_LEFT }],
    captions: [{ at: 0, text: 'Calculate and **convert**' }],
  },
  {
    kind: 'shot',
    clip: 't3',
    from: t3.ask - 0.3,
    to: t3.open + 1.8,
    cams: [{ at: 0, rect: V_CENTER }],
    captions: [{ at: 0, text: 'Your AI agent needs you?' }],
  },
  {
    kind: 'shot',
    clip: 't3',
    from: t3.unfold + 1.0,
    to: t3.allow + 2.2,
    cams: [{ at: 0, rect: V_T3 }],
    captions: [{ at: 0, text: '**Allow** it from the top bar' }],
  },
  { kind: 'outro', seconds: 2.6 },
];
