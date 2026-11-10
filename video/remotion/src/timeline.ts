// Every time in seconds. Recording times (rec*) come from video/remotion/src/film.json marks.
export const T = {
  total: 60,
  cold: [0, 6.0],
  title: [6.0, 9.5],
  app: [9.5, 29.0],
  stack: [29.0, 43.4],
  montage: [43.4, 55.0],
  end: [55.0, 60.0],
} as const;

// Hindi conversation: four cuts out of the real recording (take of 9 Nov, results-first build).
// film start, rec in, rec out. Gaps marked trimmed are processing time (end-of-speech wait + server), labelled on
// screen. The gap after cut 1 is the rest of the bot's spoken question, not waiting. Cut 3 is uncut from the
// moment results appear until the scene ends, so the real "results on screen -> voice starts" wait is shown.
export const HINDI_CUTS = [
  { at: 9.5, from: 1.85, to: 4.65, step: 0, trimmed: false },
  { at: 12.3, from: 7.0, to: 9.15, step: 1, trimmed: true },
  { at: 14.45, from: 12.8, to: 16.6, step: 2, trimmed: false },
  { at: 18.25, from: 22.05, to: 32.8, step: 3, trimmed: true },
];

export const MONTAGE = {
  kn: [
    { at: 43.4, from: 2.45, to: 6.95, trimmed: false },
    { at: 47.9, from: 10.25, to: 13.35, trimmed: true },
  ],
  ta: [{ at: 51.0, from: 11.2, to: 13.2, trimmed: true }],
  grid: [53.0, 55.0],
};

// Narration placement (seconds) — lengths come from audio.json.
export const NARRATION: Record<string, number> = {
  N1: 0.25, N2: 6.15, N3: 24.55, N4: 29.3, N5: 33.55, N6: 40.35, N7: 48.3, N8: 55.3,
};
