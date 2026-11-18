import { loadFont } from '@remotion/google-fonts/Inter';

export const { fontFamily } = loadFont('normal', {
  weights: ['400', '600', '800'],
  subsets: ['latin'],
});

export const FPS = 30;

/** Size of the recorded clips: a 1280x720 desktop at scale 2. */
export const SOURCE = { width: 2560, height: 1440 };

export const colors = {
  bg: '#0c0a10',
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.68)',
  accent: '#3584e4',
  warm: '#ff6a3d',
  violet: '#a23cff',
};

export type Format = 'landscape' | 'square' | 'vertical';

export const formats: Record<Format, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};

/** Where the screen recording sits in the frame. */
export function screenBox(format: Format) {
  const { width, height } = formats[format];
  if (format === 'vertical') return { x: 40, y: 380, width: width - 80, height: 1000, radius: 40 };
  // The panel is too wide for a square: the recording sits in a 16:9 card, the caption below it.
  if (format === 'square') return { x: 30, y: 200, width: width - 60, height: 574, radius: 28 };
  return { x: 0, y: 0, width, height, radius: 0 };
}
