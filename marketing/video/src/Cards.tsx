import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { colors, fontFamily, type Format } from './theme';

/** The backdrop of the cards and of the vertical format: dark, with the warm glow of the wallpaper. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 90% 60% at 15% 110%, ${colors.warm}55, transparent 60%),
        radial-gradient(ellipse 80% 55% at 95% -10%, ${colors.violet}50, transparent 60%), ${colors.bg}`,
    }}
  />
);

/** The notch as a mark: a pill that grows into the open panel. */
const Notch: React.FC<{ scale: number; open: number }> = ({ scale, open }) => {
  const w = interpolate(open, [0, 1], [150, 420]) * scale;
  const h = interpolate(open, [0, 1], [40, 150]) * scale;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: interpolate(open, [0, 1], [20, 36]) * scale,
        background: '#000',
        boxShadow: `0 0 0 ${2 * scale}px rgba(255,255,255,0.12), 0 ${20 * scale}px ${60 * scale}px rgba(0,0,0,0.6)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10 * scale,
      }}
    >
      {[colors.warm, colors.accent, '#2ec27e'].map((c, i) => (
        <div
          key={c}
          style={{
            width: 18 * scale,
            height: 18 * scale,
            borderRadius: 9 * scale,
            background: c,
            opacity: interpolate(open, [0.5 + i * 0.12, 0.8 + i * 0.12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        />
      ))}
    </div>
  );
};

export const TitleCard: React.FC<{ format: Format }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const open = spring({ frame: frame - 6, fps, config: { damping: 16, mass: 0.8 } });
  const text = interpolate(frame, [14, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  });
  const scale = format === 'landscape' ? 1.25 : 1.1;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Backdrop />
      <AbsoluteFill
        style={{ alignItems: 'center', justifyContent: 'center', gap: 56 * scale, fontFamily }}
      >
        <Notch scale={scale} open={open} />
        <div
          style={{
            textAlign: 'center',
            opacity: text,
            transform: `translateY(${(1 - text) * 20}px)`,
          }}
        >
          <div
            style={{
              fontSize: 132 * scale,
              fontWeight: 800,
              color: colors.text,
              letterSpacing: -4,
            }}
          >
            Visor
          </div>
          <div style={{ fontSize: 44 * scale, fontWeight: 600, color: colors.dim, marginTop: 6 }}>
            A Dynamic Island for GNOME Shell
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Outro: React.FC<{ format: Format }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 18 } });
  const line = (i: number) =>
    interpolate(frame, [6 + i * 5, 16 + i * 5], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
  const scale = format === 'landscape' ? 1.2 : 1;
  const style = (i: number): React.CSSProperties => ({
    opacity: line(i),
    transform: `translateY(${(1 - line(i)) * 16}px)`,
  });
  return (
    <AbsoluteFill>
      <Backdrop />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily,
          textAlign: 'center',
          gap: 22 * scale,
        }}
      >
        <div style={{ transform: `scale(${0.9 + 0.1 * p})`, opacity: p }}>
          <Notch scale={scale * 0.8} open={1} />
        </div>
        <div
          style={{
            ...style(0),
            fontSize: 110 * scale,
            fontWeight: 800,
            color: colors.text,
            letterSpacing: -3,
          }}
        >
          Visor
        </div>
        <div
          style={{
            ...style(1),
            fontSize: 42 * scale,
            fontWeight: 600,
            color: colors.dim,
            padding: '0 60px',
          }}
        >
          Free and open source · GNOME Shell 50 and 51
        </div>
        <div
          style={{
            ...style(2),
            marginTop: 18 * scale,
            fontSize: 44 * scale,
            fontWeight: 600,
            color: colors.text,
            padding: `${14 * scale}px ${34 * scale}px`,
            borderRadius: 60,
            background: 'rgba(255,255,255,0.09)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.14)',
          }}
        >
          github.com/taulit/visor
        </div>
        {format === 'vertical' ? (
          <div
            style={{ ...style(3), marginTop: 40, fontSize: 36, color: colors.dim, fontWeight: 600 }}
          >
            by taulit
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
