import React from 'react';
import { AbsoluteFill, Easing, Freeze, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C, F, sec } from './theme';

export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
export const ramp = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/** Paper ground with the 12-column hairline grid that every scene sits on. */
export const Paper: React.FC<{ children?: React.ReactNode; grid?: boolean }> = ({ children, grid = true }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    {grid && (
      <AbsoluteFill>
        {Array.from({ length: 13 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: 96 + i * 144, width: 1, background: C.hair }} />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 96, height: 1, background: C.hair }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, height: 1, background: C.hair }} />
      </AbsoluteFill>
    )}
    {children}
  </AbsoluteFill>
);

/** Small running header: what you are looking at and where in the film. */
export const Folio: React.FC<{ index: string; title: string }> = ({ index, title }) => (
  <div style={{ position: 'absolute', left: 96, right: 96, top: 48, display: 'flex', justifyContent: 'space-between',
    fontFamily: F.ui, fontSize: 22, color: C.mute }}>
    <span><span style={{ color: C.ink, fontWeight: 600 }}>Jeevan Dhara</span> — {title}</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{index}</span>
  </div>
);

/** A phone showing cuts from a real screen recording. Cuts are in seconds relative to the scene start. */
export const Phone: React.FC<{
  video: string; cuts: { at: number; from: number; to: number; freeze?: boolean }[]; x: number; y: number; scale?: number;
  enterAt?: number;
}> = ({ video, cuts, x, y, scale = 1, enterAt = 0 }) => {
  const f = useCurrentFrame();
  const enter = ramp(f, sec(enterAt), sec(enterAt) + 18);
  const W = 390, H = 844, B = 14;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: W + 2 * B, height: H + 2 * B,
      transform: `translateY(${(1 - enter) * 60}px) scale(${scale})`, transformOrigin: 'top left', opacity: enter,
      background: C.ink, borderRadius: 58, padding: B, boxShadow: '0 30px 60px -30px rgba(18,19,20,0.45)' }}>
      <div style={{ width: W, height: H, borderRadius: 44, overflow: 'hidden', position: 'relative', background: '#fff' }}>
        {cuts.map((c, i) => (
          <Sequence key={i} from={sec(c.at)} durationInFrames={Math.max(1, sec(c.to - c.from))} layout="none">
            {c.freeze ? (
              <Freeze frame={0}>
                <OffthreadVideo src={staticFile(video)} startFrom={sec(c.from)} muted
                  style={{ width: W, height: H, position: 'absolute', inset: 0 }} />
              </Freeze>
            ) : (
              <OffthreadVideo src={staticFile(video)} startFrom={sec(c.from)} muted
                style={{ width: W, height: H, position: 'absolute', inset: 0 }} />
            )}
          </Sequence>
        ))}
      </div>
    </div>
  );
};

/** Honest edit marker: appears at a cut where processing time was removed. */
export const TrimChip: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const o = ramp(f, sec(at), sec(at) + 6) * (1 - ramp(f, sec(at) + 36, sec(at) + 46));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 1310, top: 38, opacity: o, fontFamily: F.ui, fontSize: 20, color: C.mute,
      border: `1px solid ${C.hairStrong}`, borderRadius: 999, padding: '6px 14px', background: C.paper }}>
      ⏩ processing time trimmed
    </div>
  );
};

/** Waveform bars from real peaks; bars fill in as the audio plays. */
export const Wave: React.FC<{ peaks: number[]; start: number; dur: number; width: number; height: number; color?: string }> = ({
  peaks, start, dur, width, height, color = C.ink,
}) => {
  const f = useCurrentFrame();
  const p = ramp(f, sec(start), sec(start + dur));
  const bw = width / peaks.length;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {peaks.map((v, i) => {
        const h = Math.max(2, v * height);
        const on = i / peaks.length <= p;
        return <rect key={i} x={i * bw} y={(height - h) / 2} width={Math.max(1, bw - 2)} height={h}
          fill={on ? color : C.hairStrong} rx={1} />;
      })}
    </svg>
  );
};

/** Concentric rings — the 5/10/15/20 km ladder, used as the film's only transition device. */
export const Rings: React.FC<{ cx: number; cy: number; start: number; maxR: number; labels?: boolean; found?: number }> = ({
  cx, cy, start, maxR, labels = false, found,
}) => {
  const f = useCurrentFrame();
  const kms = [5, 10, 15, 20];
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible' }} width={1920} height={1080}>
      {kms.map((km, i) => {
        const p = ramp(f, sec(start + i * 0.18), sec(start + i * 0.18) + 22);
        const r = (maxR * km) / 20 * p;
        const isFound = found === km;
        return (
          <g key={km} opacity={p}>
            <circle cx={cx} cy={cy} r={r} fill={isFound ? 'rgba(211,47,47,0.06)' : 'none'}
              stroke={isFound ? C.red : C.hairStrong} strokeWidth={isFound ? 3 : 1.5} strokeDasharray={isFound ? undefined : '8 8'} />
            {labels && <text x={cx + r + 10} y={cy + 8} fontFamily={F.ui} fontSize={22} fill={isFound ? C.red : C.mute}
              style={{ fontVariantNumeric: 'tabular-nums' }}>{km} km</text>}
          </g>
        );
      })}
    </svg>
  );
};

/** Burned-in captions for the narrator, so the film works muted in a feed. */
export const Caption: React.FC<{ text: string; start: number; dur: number }> = ({ text, start, dur }) => {
  const f = useCurrentFrame();
  const o = ramp(f, sec(start), sec(start) + 6) * (1 - ramp(f, sec(start + dur) - 4, sec(start + dur) + 4));
  if (o <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 96, bottom: 44, maxWidth: 1180, opacity: o, fontFamily: F.ui, fontSize: 30,
      lineHeight: 1.3, color: C.ink, fontWeight: 500 }}>
      {text}
    </div>
  );
};

export const Fill: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill>{children}</AbsoluteFill>;
