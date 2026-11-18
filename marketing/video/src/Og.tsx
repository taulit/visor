import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Backdrop } from './Cards';
import { colors, fontFamily } from './theme';

/** The Open Graph image of the website and the posts: 1200x630. */
export const Og: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: 150,
        width: 470,
        fontFamily,
        color: colors.text,
      }}
    >
      <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>Visor</div>
      <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.15, marginTop: 22 }}>
        A Dynamic Island for GNOME Shell
      </div>
      <div style={{ fontSize: 26, color: colors.dim, marginTop: 26, lineHeight: 1.35 }}>
        Media, timers, calendar and search below the top bar, open to modules. Free and open source.
      </div>
    </div>
    {/* The open panel, cut from the recording (x 316–2244, y 66–882 of 2560x1440); it bleeds off the right edge. */}
    <div
      style={{
        position: 'absolute',
        left: 590,
        top: 90,
        width: 760,
        height: 450,
        overflow: 'hidden',
        borderRadius: 26,
        boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)',
      }}
    >
      <Img
        src={staticFile('frames/open.png')}
        style={{
          position: 'absolute',
          width: 2560 * 0.5,
          height: 1440 * 0.5,
          left: -296 * 0.5,
          top: -66 * 0.5,
          maxWidth: 'none',
        }}
      />
    </div>
  </AbsoluteFill>
);
