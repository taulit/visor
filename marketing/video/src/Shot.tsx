import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { Caption } from './Caption';
import type { Clip } from './markers';
import { FPS, type Format, screenBox, SOURCE } from './theme';

/** A rectangle of the recording: [x, y, width, height] in its pixels. */
export type Rect = [number, number, number, number];

export type Cam = { at: number; rect: Rect; dur?: number };
export type Cue = { at: number; text: string };

export type ShotSpec = {
  kind: 'shot';
  clip: Clip;
  /** Seconds of the clip. */
  from: number;
  to: number;
  /** Camera moves; `at` in seconds of the clip. The first one is where it starts. */
  cams: Cam[];
  captions?: Cue[];
};

export const shotFrames = (s: ShotSpec) => Math.round((s.to - s.from) * FPS);

const ease = Easing.bezier(0.65, 0, 0.35, 1);
const lerp = (a: Rect, b: Rect, p: number): Rect => a.map((v, i) => v + (b[i]! - v) * p) as Rect;

function cameraAt(cams: Cam[], t: number): Rect {
  let rect = cams[0]!.rect;
  for (const cam of cams.slice(1)) {
    if (t < cam.at) break;
    const dur = cam.dur ?? 0.8;
    const p = Math.min(1, (t - cam.at) / dur);
    rect = lerp(rect, cam.rect, ease(p));
  }
  return rect;
}

export const Shot: React.FC<{ spec: ShotSpec; format: Format }> = ({ spec, format }) => {
  const frame = useCurrentFrame();
  const t = spec.from + frame / FPS;
  const box = screenBox(format);
  const [x, y, w, h] = cameraAt(spec.cams, t);

  // Fit the rectangle into the box, then keep the picture inside the recording.
  const s = Math.min(box.width / w, box.height / h);
  const clamp = (v: number, size: number, boxSize: number) =>
    size * s <= boxSize ? (boxSize - size * s) / 2 : Math.min(0, Math.max(boxSize - size * s, v));
  const tx = clamp(box.width / 2 - (x + w / 2) * s, SOURCE.width, box.width);
  const ty = clamp(box.height / 2 - (y + h / 2) * s, SOURCE.height, box.height);

  const fade = interpolate(frame, [0, 5], [0, 1], { extrapolateRight: 'clamp' });
  const cues = spec.captions ?? [];
  const cueIndex = cues.findLastIndex(c => t >= c.at);
  const cue = cues[cueIndex];

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <div
        style={{
          position: 'absolute',
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          overflow: 'hidden',
          borderRadius: box.radius,
          background: '#000',
          boxShadow: box.radius
            ? '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)'
            : undefined,
        }}
      >
        <OffthreadVideo
          src={staticFile(`clips/${spec.clip}.mp4`)}
          trimBefore={Math.round(spec.from * FPS)}
          muted
          style={{
            position: 'absolute',
            width: SOURCE.width,
            height: SOURCE.height,
            transformOrigin: '0 0',
            transform: `translate(${tx}px, ${ty}px) scale(${s})`,
            maxWidth: 'none',
          }}
        />
      </div>
      {cue ? (
        <Caption
          key={cueIndex}
          text={cue.text}
          format={format}
          enterFrame={Math.max(0, Math.round((cue.at - spec.from) * FPS))}
        />
      ) : null}
    </AbsoluteFill>
  );
};
