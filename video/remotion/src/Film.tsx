import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import film from './film.json';
import { C, F, sec, stack } from './theme';
import { Caption, Folio, Paper, Phone, ramp, Rings, TrimChip, Wave } from './parts';
import { HINDI_CUTS, MONTAGE, NARRATION, T } from './timeline';

interface Turn {
  t: number;
  status: string;
  heard: { transcript: string | null; language: string; blood_group: string | null; units: number; place: string | null };
  timings: Record<string, number>;
  search: { center: { lat: number; lng: number }; searched_km: number[]; found_within_km: number | null; empty_within_km: number | null } | null;
  reply_text: string; reply_lang: string; reply_audio: string | null;
  results: { rank: number; name: string; distance_km: number; lat: number; lng: number; units: number; blood_group: string; match: string }[];
}
interface Scene { video: string; marks: Record<string, number[]>; turns: Turn[] }
const scenes = film.scenes as unknown as Record<'hindi' | 'kannada' | 'tamil', Scene>;
const hindi = scenes.hindi;
const kannada = scenes.kannada;
const tamil = scenes.tamil;
const ask1 = hindi.turns[0];
const ask2 = hindi.turns[hindi.turns.length - 1];
const knTurn = kannada.turns[kannada.turns.length - 1];
const taTurn = tamil.turns[tamil.turns.length - 1];
const mark = (s: { marks: Record<string, number[]> }, k: string, i = 0) => s.marks[k][i];

/** Render children only inside [a, b) seconds, without resetting the frame clock. */
const Win: React.FC<{ a: number; b: number; children: React.ReactNode }> = ({ a, b, children }) => {
  const f = useCurrentFrame();
  return f >= sec(a) && f < sec(b) ? <>{children}</> : null;
};
// First sentence; a full stop after a single capital ("T. Nagar") is an initial, not an ending.
const firstSentence = (t: string) => (t.match(/^.*?(?<!\b[A-Z])[।.?!](?=\s|$)/)?.[0] ?? t).trim();
const fmtS = (ms: number) => (ms / 1000).toFixed(2); // milliseconds -> seconds, always

// ---------------------------------------------------------------- 1. Cold open
const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();
  const words = ['खून', 'चाहिए'];
  const calls = ['Blood bank 1 — no answer', 'Blood bank 2 — no O− today', 'Blood bank 3 — line busy', 'Blood bank 4 — call back later'];
  const out = ramp(f, sec(5.3), sec(6.0));
  return (
    <Paper>
      <Folio index="01 / 05" title="the problem" />
      <div style={{ position: 'absolute', left: 96, top: 190, opacity: 1 - out }}>
        <div style={{ display: 'flex', gap: 44, fontFamily: stack('deva'), fontWeight: 800, fontSize: 290, lineHeight: 1.05, color: C.ink }}>
          {words.map((w, i) => {
            const p = ramp(f, sec(0.35 + i * 0.6), sec(0.35 + i * 0.6) + 20);
            return <span key={w} style={{ clipPath: `inset(-20% ${100 - p * 100}% -30% 0)` }}>{w}</span>;
          })}
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 32, color: C.mute, marginTop: 84, opacity: ramp(f, sec(1.6), sec(2.1)) }}>
          “I need blood.” Then the phone calls start.
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1192, top: 610, width: 632, fontFamily: F.ui, fontSize: 28, opacity: 1 - out }}>
        {calls.map((c, i) => {
          const p = ramp(f, sec(2.2 + i * 0.55), sec(2.2 + i * 0.55) + 8);
          return (
            <div key={c} style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)`, padding: '16px 0',
              borderTop: `1px solid ${C.hairStrong}`, display: 'flex', justifyContent: 'space-between', color: C.ink }}>
              <span>{c}</span><span style={{ color: C.red, fontWeight: 600 }}>✕</span>
            </div>
          );
        })}
      </div>
      <Rings cx={1580} cy={880} start={4.8} maxR={1500} />
    </Paper>
  );
};

// ---------------------------------------------------------------- 2. Title
const Title: React.FC = () => {
  const f = useCurrentFrame();
  const a = sec(T.title[0]);
  return (
    <Paper>
      <Folio index="01 / 05" title="introducing" />
      <div style={{ position: 'absolute', left: 96, top: 300 }}>
        <div style={{ fontFamily: F.latin, fontWeight: 800, fontSize: 176, lineHeight: 0.95, color: C.ink, letterSpacing: -3,
          clipPath: `inset(-10% ${100 - ramp(f, a, a + 16) * 100}% -10% 0)` }}>Jeevan Dhara</div>
        <div style={{ fontFamily: stack('deva'), fontWeight: 600, fontSize: 104, color: C.red, marginTop: 8,
          opacity: ramp(f, a + 8, a + 22) }}>जीवन धारा</div>
        <div style={{ fontFamily: F.ui, fontSize: 34, color: C.ink, marginTop: 28, maxWidth: 860, opacity: ramp(f, a + 16, a + 30) }}>
          Ask for blood by voice, in your own language. Hear the nearest blood banks that have it.
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------- 3. Live Hindi conversation
const STEPS = ['She speaks Hindi. No menus, no typing.', 'It asks only what is missing.', 'It listens again, with no tap.', 'The search widens: 5 km, then 10 km.'];
const AppScene: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  const seg = HINDI_CUTS.reduce((acc, c, i) => (t >= c.at ? i : acc), 0);
  const res = ask2.search!;
  const nearest = ask2.results[0];
  const panels = [
    { who: 'Caller · Hindi', text: ask1.heard.transcript ?? '', wave: { id: 'hi_1', start: HINDI_CUTS[0].at + mark(hindi, 'caller_start:hi_1') - HINDI_CUTS[0].from } },
    { who: 'Jeevan Dhara · spoken by Gnani Timbre', text: firstSentence(ask1.reply_text), wave: null },
    { who: 'Caller · answering, hands-free', text: ask2.heard.transcript ?? '', wave: { id: 'hi_2', start: HINDI_CUTS[2].at + mark(hindi, 'caller_start:hi_2') - HINDI_CUTS[2].from } },
    { who: 'Jeevan Dhara · results', text: `${res.found_within_km} किमी में ${ask2.results.length} ब्लड बैंक`,
      sub: `None within ${res.empty_within_km} km · ${ask2.results.length} within ${res.found_within_km} km · nearest ${nearest.distance_km} km, ${nearest.name}`, wave: null },
  ];
  const p = panels[seg];
  const segStart = HINDI_CUTS[seg].at;
  const pin = ramp(f, sec(segStart), sec(segStart) + 10);
  return (
    <Paper>
      <Folio index="02 / 05" title="a real conversation, recorded from the app" />
      <div style={{ position: 'absolute', left: 96, top: 170, width: 1000 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'baseline', gap: 24, padding: '12px 0', borderTop: `1px solid ${C.hair}`,
            opacity: i === seg ? 1 : i < seg ? 0.38 : 0.2 }}>
            <span style={{ fontFamily: F.latin, fontWeight: 600, fontSize: 40, color: i === seg ? C.red : C.mute,
              fontVariantNumeric: 'tabular-nums', width: 60 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontFamily: F.ui, fontSize: 32, color: C.ink, fontWeight: i === seg ? 600 : 400 }}>{s}</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 96, top: 560, width: 1020, opacity: pin, transform: `translateY(${(1 - pin) * 16}px)` }}>
        <div style={{ fontFamily: F.ui, fontSize: 22, color: seg % 2 ? C.red : C.mute, fontWeight: 600, marginBottom: 12 }}>{p.who}</div>
        <div style={{ fontFamily: stack('deva'), fontWeight: 600, fontSize: seg === 1 ? 56 : 68, lineHeight: 1.25, color: C.ink }}>{p.text}</div>
        {p.sub && <div style={{ fontFamily: F.ui, fontSize: 26, color: C.mute, marginTop: 14 }}>{p.sub}</div>}
        {p.wave && (
          <div style={{ marginTop: 24 }}>
            <Wave peaks={film.waves[p.wave.id as 'hi_1']} start={p.wave.start} dur={film.audio[p.wave.id as 'hi_1'].seconds} width={720} height={64} />
          </div>
        )}
      </div>
      <Phone video={hindi.video} x={1236} y={104} cuts={HINDI_CUTS} />
      {HINDI_CUTS.filter((c) => c.trimmed).map((c) => <TrimChip key={c.at} at={c.at} />)}
    </Paper>
  );
};

// ---------------------------------------------------------------- 4. Exploded stack
const Layer: React.FC<{ i: number; at: number; name: string; model: string; metric: string; unit: string; children: React.ReactNode }> = ({
  i, at, name, model, metric, unit, children,
}) => {
  const f = useCurrentFrame();
  const p = ramp(f, sec(at), sec(at) + 20);
  const y = 210 + i * 152;
  // Each layer lifts out of the phone's position and settles into its slot.
  const fromX = 1300, fromY = 420;
  const x = interpolate(p, [0, 1], [fromX, 560]);
  const yy = interpolate(p, [0, 1], [fromY, y]);
  return (
    <>
      <div style={{ position: 'absolute', left: 96, top: y + 14, width: 440, opacity: p }}>
        <div style={{ fontFamily: F.latin, fontWeight: 600, fontSize: 30, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</div>
        <div style={{ fontFamily: F.ui, fontSize: 28, fontWeight: 600, color: C.ink }}>{name}</div>
        <div style={{ fontFamily: F.ui, fontSize: 20, color: C.mute }}>{model}</div>
      </div>
      <div style={{ position: 'absolute', left: x, top: yy, width: 1010, height: 128, opacity: p, background: C.card,
        border: `1px solid ${C.hairStrong}`, borderRadius: 14, padding: '18px 26px', boxShadow: '0 18px 30px -24px rgba(18,19,20,0.5)',
        transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: 'left center', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {children}
      </div>
      <div style={{ position: 'absolute', left: 1600, top: y + 22, width: 230, textAlign: 'right', opacity: ramp(f, sec(at) + 12, sec(at) + 24) }}>
        <span style={{ fontFamily: F.latin, fontWeight: 600, fontSize: 64, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{metric}</span>
        <span style={{ fontFamily: F.ui, fontSize: 24, color: C.mute, marginLeft: 6 }}>{unit}</span>
      </div>
    </>
  );
};

const MiniRings: React.FC = () => {
  const s = ask2.search!;
  const cx = 70, cy = 46, kmPx = 4.4;
  const lat0 = s.center.lat, lng0 = s.center.lng;
  return (
    <svg width={150} height={92} style={{ flex: 'none', marginRight: 24 }}>
      {[5, 10].map((km) => (
        <circle key={km} cx={cx} cy={cy} r={km * kmPx} fill="none" stroke={km === s.found_within_km ? C.red : C.mute}
          strokeWidth={km === s.found_within_km ? 2 : 1.5} strokeDasharray={km === s.found_within_km ? undefined : '4 4'} />
      ))}
      <circle cx={cx} cy={cy} r={4} fill={C.ink} />
      {ask2.results.map((r) => {
        const dx = (r.lng - lng0) * 111 * Math.cos((lat0 * Math.PI) / 180);
        const dy = (r.lat - lat0) * 111;
        return <circle key={r.rank} cx={cx + dx * kmPx} cy={cy - dy * kmPx} r={5} fill={C.red} />;
      })}
    </svg>
  );
};

const StackScene: React.FC = () => {
  const f = useCurrentFrame();
  const tm = ask2.timings as Record<string, number>;
  const s = ask2.search!;
  // Measured in the recording: answer arrives on screen -> voice actually starts playing.
  const voiceAfter = (mark(hindi, 'reply_sound', 1) - ask2.t).toFixed(1);
  const json = `{ "blood_group": "${ask2.heard.blood_group}", "units": ${ask2.heard.units}, "place": "${ask2.heard.place}" }`;
  const a = sec(T.stack[0]);
  return (
    <Paper>
      <Folio index="03 / 05" title="under the hood — the same request, taken apart" />
      <div style={{ position: 'absolute', left: 96, top: 112, fontFamily: F.latin, fontWeight: 800, fontSize: 64, color: C.ink, letterSpacing: -1,
        opacity: ramp(f, a, a + 12) }}>One request, five layers</div>
      <Layer i={0} at={29.4} name="Your voice" model="recorded in the browser, ends when you stop" metric={film.audio.hi_2.seconds.toFixed(1)} unit="s">
        <Wave peaks={film.waves.hi_2} start={29.6} dur={1.6} width={950} height={70} color={C.ink} />
      </Layer>
      <Layer i={1} at={31.2} name="Speech to text" model="Gnani Prisma v3.0 · language auto-detected" metric={fmtS(tm.stt_ms)} unit="s">
        <div>
          <div style={{ fontFamily: stack('deva'), fontSize: 40, fontWeight: 600, color: C.ink }}>{ask2.heard.transcript}</div>
          <div style={{ fontFamily: F.ui, fontSize: 20, color: C.red, fontWeight: 600 }}>detected: {ask2.heard.language}</div>
        </div>
      </Layer>
      <Layer i={2} at={33.7} name="Understanding" model="Qwen on Groq → strict schema, checked in code" metric={fmtS(tm.understand_ms)} unit="s">
        <div>
          <div style={{ fontFamily: F.latin, fontSize: 32, fontWeight: 600, color: C.ink }}>{json}</div>
          <div style={{ fontFamily: F.ui, fontSize: 20, color: C.mute }}>blood group accepted only because “ओ” was heard — never guessed</div>
        </div>
      </Layer>
      <Layer i={3} at={37.2} name="Radius search" model="synthetic eRaktKosh-style data · compatibility in code" metric={String(tm.search_ms)} unit="ms">
        <MiniRings />
        <div style={{ fontFamily: F.ui, fontSize: 28, color: C.ink }}>
          None within {s.empty_within_km} km → <b>{ask2.results.length} within {s.found_within_km} km</b>
          <div style={{ fontSize: 20, color: C.mute }}>{ask2.results.map((r) => `${r.distance_km} km`).join(' · ')}</div>
        </div>
      </Layer>
      <Layer i={4} at={40.4} name="Spoken answer" model="Gnani Timbre v2.5 · after results show" metric={voiceAfter} unit="s later">
        <div style={{ fontFamily: stack('deva'), fontSize: 32, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
          {ask2.reply_text.split('।').slice(0, 2).join('।').replace(/(\d) /g, '$1 ')}।
        </div>
      </Layer>
    </Paper>
  );
};

// ---------------------------------------------------------------- 5. Montage
const LANGS: [string, keyof typeof F][] = [
  ['हिन्दी', 'deva'], ['ಕನ್ನಡ', 'kannada'], ['தமிழ்', 'tamil'], ['తెలుగు', 'telugu'], ['മലയാളം', 'malayalam'],
  ['मराठी', 'deva'], ['বাংলা', 'bangla'], ['ગુજરાતી', 'gujarati'], ['ਪੰਜਾਬੀ', 'gurmukhi'], ['English', 'latin'],
];
const Montage: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  const isTa = t >= MONTAGE.ta[0].at;
  const isGrid = t >= MONTAGE.grid[0];
  const isKnResult = t >= MONTAGE.kn[1].at && !isTa;
  const word = isTa ? 'தமிழ்' : 'ಕನ್ನಡ';
  const script: keyof typeof F = isTa ? 'tamil' : 'kannada';
  const turn = isTa ? taTurn : knTurn;
  const enter = ramp(f, sec(isTa ? MONTAGE.ta[0].at : T.montage[0]), sec(isTa ? MONTAGE.ta[0].at : T.montage[0]) + 12);
  const knWaveStart = MONTAGE.kn[0].at + mark(kannada, 'caller_start:kn_1') - MONTAGE.kn[0].from;
  if (isGrid) {
    const g = sec(MONTAGE.grid[0]);
    return (
      <Paper>
        <Folio index="04 / 05" title="any language Gnani's models speak" />
        <div style={{ position: 'absolute', left: 96, top: 170, fontFamily: F.latin, fontWeight: 800, fontSize: 280, lineHeight: 0.9, color: C.red,
          opacity: ramp(f, g, g + 8), fontVariantNumeric: 'tabular-nums' }}>10</div>
        <div style={{ position: 'absolute', left: 104, top: 440, fontFamily: F.ui, fontSize: 30, color: C.ink, width: 420, opacity: ramp(f, g + 4, g + 14) }}>
          Indian languages in, the same language out — detected from the voice itself.
        </div>
        <div style={{ position: 'absolute', left: 672, top: 190, width: 1152, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', rowGap: 6, columnGap: 48 }}>
          {LANGS.map(([w, s], i) => {
            const p = ramp(f, g + i * 2, g + i * 2 + 10);
            return <div key={w} style={{ fontFamily: stack(s), fontWeight: 600, fontSize: 64, color: C.ink, opacity: p,
              borderTop: `1px solid ${C.hair}`, padding: '6px 0', transform: `translateY(${(1 - p) * 12}px)` }}>{w}</div>;
          })}
        </div>
      </Paper>
    );
  }
  return (
    <Paper>
      <Folio index="04 / 05" title="the same app, other languages" />
      <div style={{ position: 'absolute', left: 96, top: 150, opacity: enter }}>
        <div style={{ fontFamily: stack(script), fontWeight: 800, fontSize: 230, lineHeight: 1.1, color: C.ink }}>{word}</div>
        <div style={{ fontFamily: F.ui, fontSize: 22, color: isKnResult || isTa ? C.red : C.mute, fontWeight: 600, marginTop: 72 }}>
          {isKnResult || isTa ? `Jeevan Dhara · answered in ${turn.reply_lang}` : 'Caller · Kannada'}
        </div>
        <div style={{ fontFamily: stack(script), fontWeight: 600, fontSize: 50, lineHeight: 1.3, color: C.ink, width: 1000, marginTop: 10 }}>
          {isKnResult || isTa ? firstSentence(turn.reply_text) : turn.heard.transcript}
        </div>
        {!isKnResult && !isTa && (
          <div style={{ marginTop: 24 }}>
            <Wave peaks={film.waves.kn_1} start={knWaveStart} dur={film.audio.kn_1.seconds} width={720} height={64} />
          </div>
        )}
        {(isKnResult || isTa) && (
          <div style={{ fontFamily: F.ui, fontSize: 26, color: C.mute, marginTop: 16 }}>
            {turn.results.length} banks within {turn.search?.found_within_km} km · speech to text {fmtS((turn.timings as Record<string, number>).stt_ms)} s · search {(turn.timings as Record<string, number>).search_ms} ms
          </div>
        )}
      </div>
      {isTa ? <Phone video={tamil.video} x={1236} y={104} cuts={MONTAGE.ta} />
        : <Phone video={kannada.video} x={1236} y={104} cuts={MONTAGE.kn} />}
      {[...MONTAGE.kn, ...MONTAGE.ta].filter((c) => c.trimmed).map((c) => <TrimChip key={c.at} at={c.at} />)}
    </Paper>
  );
};

// ---------------------------------------------------------------- 6. End card
const End: React.FC = () => {
  const f = useCurrentFrame();
  const a = sec(T.end[0]);
  return (
    <Paper>
      <Rings cx={1480} cy={540} start={T.end[0]} maxR={900} labels found={10} />
      <div style={{ position: 'absolute', left: 96, top: 300 }}>
        <div style={{ fontFamily: F.latin, fontWeight: 800, fontSize: 150, color: C.ink, letterSpacing: -2, lineHeight: 0.95,
          opacity: ramp(f, a, a + 12) }}>Jeevan Dhara</div>
        <div style={{ fontFamily: F.latin, fontWeight: 600, fontSize: 60, color: C.red, marginTop: 18, opacity: ramp(f, a + 8, a + 20) }}>
          Speak, and find blood.
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 30, color: C.ink, marginTop: 40, opacity: ramp(f, a + 16, a + 28) }}>
          Built on Gnani Prisma v3.0 (speech to text) and Gnani Timbre v2.5 (text to speech).
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 22, color: C.mute, marginTop: 14, opacity: ramp(f, a + 22, a + 34) }}>
          All blood bank data in this film is synthetic. In an emergency, call 108.
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------- sound
const Clip: React.FC<{ src: string; at: number; until?: number; vol?: (t: number) => number }> = ({ src, at, until, vol }) => (
  <Sequence from={sec(at)} durationInFrames={until ? sec(until - at) : undefined} layout="none">
    <Audio src={staticFile(src)} volume={vol ? (fr) => vol(fr / 30) : 1} />
  </Sequence>
);
/** Full volume for `fullFor` s, then dip to `low` under the narrator, fade out by `end`. */
const duck = (fullFor: number, low: number, end: number) => {
  const a = Math.max(0.05, fullFor);
  const b = Math.max(a + 0.8, end);
  return (t: number) => interpolate(t, [0, a, a + 0.35, b - 0.4, b], [1, 1, low, low, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
};

// Music bed: set to a file in public/ (e.g. 'music/bed.mp3') once the user approves a track. Kept very low.
export const MUSIC: string | null = 'music/bed.mp3'; // generated by video/make_music.py
const MUSIC_VOL = 0.5; // bed is mastered at -24 LUFS; this sits it ~13 dB under the -16 LUFS voices
const musicVolume = (t: number) =>
  MUSIC_VOL * interpolate(t, [0, 1.5, T.total - 2.5, T.total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const Sound: React.FC = () => {
  const c0 = HINDI_CUTS[0], c1 = HINDI_CUTS[1], c2 = HINDI_CUTS[2], c3 = HINDI_CUTS[3];
  const r1 = c1.at + mark(hindi, 'reply_sound', 0) - c1.from;
  const r2 = c3.at + mark(hindi, 'reply_sound', 1) - c3.from;
  const [k0, k1] = MONTAGE.kn;
  const t0 = MONTAGE.ta[0];
  const kr = k1.at + mark(kannada, 'reply_sound') - k1.from;
  const tr = t0.at + mark(tamil, 'reply_sound') - t0.from;
  return (
    <>
      {Object.entries(NARRATION).map(([id, at]) => (
        <Clip key={id} src={film.audio[id as 'N1'].file} at={at} />
      ))}
      <Clip src={film.audio.hi_1.file} at={c0.at + mark(hindi, 'caller_start:hi_1') - c0.from} />
      <Clip src={ask1.reply_audio!} at={r1} until={c2.at} />
      <Clip src={film.audio.hi_2.file} at={c2.at + mark(hindi, 'caller_start:hi_2') - c2.from} />
      <Clip src={ask2.reply_audio!} at={r2} until={T.app[1]} vol={duck(NARRATION.N3 - r2 - 0.3, 0.14, T.app[1] - r2)} />
      <Clip src={film.audio.kn_1.file} at={k0.at + mark(kannada, 'caller_start:kn_1') - k0.from} />
      <Clip src={knTurn.reply_audio!} at={kr} until={t0.at} vol={duck(NARRATION.N7 - kr - 0.3, 0.12, t0.at - kr)} />
      <Clip src={taTurn.reply_audio!} at={tr} until={MONTAGE.grid[0]} vol={() => 0.12} />
      {MUSIC && <Clip src={MUSIC} at={0} until={T.total} vol={musicVolume} />}
    </>
  );
};

const CAPTIONS: Record<string, string> = Object.fromEntries(Object.entries(film.audio).filter(([k]) => k.startsWith('N')).map(([k, v]) => [k, v.text]));

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <Win a={T.cold[0]} b={T.cold[1]}><ColdOpen /></Win>
    <Win a={T.title[0]} b={T.title[1]}>
      <Title />
      <Phone video={hindi.video} x={1236} y={104} enterAt={T.title[0] + 0.2} cuts={[{ at: T.title[0], from: 1.0, to: 1.0 + (T.title[1] - T.title[0]), freeze: true }]} />
    </Win>
    <Win a={T.app[0]} b={T.app[1]}><AppScene /></Win>
    <Win a={T.stack[0]} b={T.stack[1]}><StackScene /></Win>
    <Win a={T.montage[0]} b={T.montage[1]}><Montage /></Win>
    <Win a={T.end[0]} b={T.end[1]}><End /></Win>
    {Object.entries(NARRATION).map(([id, at]) => (
      <Caption key={id} text={CAPTIONS[id]} start={at} dur={film.audio[id as 'N1'].seconds} />
    ))}
    <Sound />
  </AbsoluteFill>
);
