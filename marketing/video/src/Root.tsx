import React from 'react';
import { AbsoluteFill, Composition, Series, Still } from 'remotion';
import { Backdrop, Outro, TitleCard } from './Cards';
import { long, type Part, reel } from './edits';
import { Og } from './Og';
import { Shot, type ShotSpec, shotFrames } from './Shot';
import { colors, FPS, type Format, formats, fontFamily } from './theme';

const frames = (p: Part) => (p.kind === 'shot' ? shotFrames(p) : Math.round(p.seconds * FPS));
const total = (parts: Part[]) => parts.reduce((n, p) => n + frames(p), 0);

const Edit: React.FC<{ parts: Part[]; format: Format }> = ({ parts, format }) => (
  <AbsoluteFill style={{ background: colors.bg }}>
    {format === 'vertical' ? <VerticalFrame /> : null}
    <Series>
      {parts.map((p, n) => (
        <Series.Sequence key={n} durationInFrames={frames(p)}>
          {p.kind === 'title' ? (
            <TitleCard format={format} />
          ) : p.kind === 'outro' ? (
            <Outro format={format} />
          ) : (
            <Shot spec={p as ShotSpec} format={format} />
          )}
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

/** The reel: the recording in a card, a header above, the caption below. */
const VerticalFrame: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <div
      style={{
        position: 'absolute',
        top: 150,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily,
        color: colors.text,
      }}
    >
      <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>Visor</div>
      <div style={{ fontSize: 34, fontWeight: 600, color: colors.dim, marginTop: 4 }}>
        GNOME Shell extension · open source
      </div>
    </div>
  </AbsoluteFill>
);

const comp = (id: string, parts: Part[], format: Format) => (
  <Composition
    id={id}
    component={Edit}
    defaultProps={{ parts, format }}
    durationInFrames={total(parts)}
    fps={FPS}
    width={formats[format].width}
    height={formats[format].height}
  />
);

export const Root: React.FC = () => (
  <>
    {comp('Reddit', long, 'landscape')}
    {comp('RedditSquare', long, 'square')}
    {comp('Reel', reel, 'vertical')}
    <Still id="OgImage" component={Og} width={1200} height={630} />
  </>
);
