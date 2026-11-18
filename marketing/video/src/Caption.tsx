import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { colors, fontFamily, type Format, formats, screenBox } from './theme';

/** A short line of text, readable without sound. `**word**` is set in the accent colour. */
export const Caption: React.FC<{ text: string; format: Format; enterFrame: number }> = ({
  text,
  format,
  enterFrame,
}) => {
  const frame = useCurrentFrame() - enterFrame;
  const p = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const parts = text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') ? (
      <span key={i} style={{ color: '#8fc0ff' }}>
        {part.slice(2, -2)}
      </span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );

  const { width } = formats[format];
  if (format === 'vertical') {
    const box = screenBox(format);
    return (
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: box.y + box.height + 60,
          textAlign: 'center',
          fontFamily,
          fontWeight: 800,
          fontSize: 66,
          lineHeight: 1.12,
          letterSpacing: -1,
          color: colors.text,
          opacity: p,
          transform: `translateY(${(1 - p) * 24}px)`,
        }}
      >
        {parts}
      </div>
    );
  }

  const size = format === 'square' ? 46 : 50;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: format === 'square' ? 56 : 64,
        display: 'flex',
        justifyContent: 'center',
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px)`,
      }}
    >
      <div
        style={{
          maxWidth: width - 120,
          padding: `${size * 0.42}px ${size * 0.8}px`,
          borderRadius: size,
          background: 'rgba(16, 14, 22, 0.86)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.10)',
          fontFamily,
          fontWeight: 600,
          fontSize: size,
          lineHeight: 1.2,
          color: colors.text,
          textAlign: 'center',
          letterSpacing: -0.5,
        }}
      >
        {parts}
      </div>
    </div>
  );
};
