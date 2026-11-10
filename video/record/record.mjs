// Records real Jeevan Dhara sessions for the demo film.
// - Chrome (installed) driven by playwright-core, phone viewport at 2x.
// - Caller lines (Gnani TTS WAVs) are fed in as the microphone, so the app's own end-of-speech detection runs.
// - Frames come from the DevTools screencast (high quality JPEG), with wall-clock timestamps.
// - Every /api/ask response and every reply MP3 is saved, with the moment it started playing.
// Usage: node record.mjs <scene> [<scene> ...]   scenes: hindi kannada tamil
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const AUDIO = path.join(ROOT, 'video', 'remotion', 'public', 'audio');
const OUT = path.join(ROOT, 'video', 'remotion', 'public', 'rec');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = 'http://127.0.0.1:8000/';

const SCENES = {
  hindi: { clips: ['hi_1', 'hi_2'], turns: 2 },
  kannada: { clips: ['kn_1'], turns: 1 },
  tamil: { clips: ['ta_1'], turns: 1 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(name) {
  const scene = SCENES[name];
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--lang=en-IN'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    geolocation: { latitude: 12.9255, longitude: 77.5937, accuracy: 18 },
    permissions: ['geolocation', 'microphone'],
  });
  const page = await context.newPage();
  const marks = [];
  await page.exposeBinding('__mark', (_src, kind, data) => { marks.push({ t: Date.now() / 1000, kind, data }); });

  // Serve caller clips to the page.
  await page.route('**/__clip/*', (route) => {
    const id = path.basename(new URL(route.request().url()).pathname);
    route.fulfill({ status: 200, contentType: 'audio/wav', body: fs.readFileSync(path.join(AUDIO, `${id}.wav`)) });
  });
  // The microphone plays the caller lines in order; mark when each one starts and ends.
  await page.addInitScript((clips) => {
    let i = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const id = clips[Math.min(i++, clips.length - 1)];
      const ab = await ctx.decodeAudioData(await (await fetch(`/__clip/${id}`)).arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = ab;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      setTimeout(() => { src.start(); window.__mark('caller_start', id); }, 700);
      src.onended = () => window.__mark('caller_end', id);
      return dest.stream;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...a) {
      window.__mark('reply_play', this.currentSrc || this.src);
      // play() is called the moment the answer arrives; the voice is made in the background, so mark
      // when sound actually starts.
      this.addEventListener('playing', () => window.__mark('reply_sound', this.currentSrc || this.src), { once: true });
      this.addEventListener('ended', () => window.__mark('reply_end', this.currentSrc || this.src), { once: true });
      return play.apply(this, a);
    };
  }, scene.clips);

  // Save API responses and reply audio.
  const asks = [];
  page.on('response', async (res) => {
    const u = new URL(res.url());
    try {
      if (u.pathname === '/api/ask' || u.pathname === '/api/search') {
        const req = res.request();
        const timing = req.timing();
        asks.push({ t: Date.now() / 1000, path: u.pathname, ms: Math.round(timing.responseEnd), body: await res.json() });
      } else if (u.pathname.startsWith('/media/')) {
        fs.writeFileSync(path.join(dir, path.basename(u.pathname)), await res.body());
      }
    } catch { /* body unavailable */ }
  });

  // Screencast frames.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const n = frames.length;
    const file = `f${String(n).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, 'frames', file), Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  marks.push({ t: Date.now() / 1000, kind: 'start' });
  await sleep(1800);

  await page.tap('#talk');
  marks.push({ t: Date.now() / 1000, kind: 'tap' });

  // Wait for the expected number of answered turns, then for the last reply to finish speaking.
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const done = asks.filter((a) => a.body?.status && a.body.status !== 'clarify').length >= 1 && asks.length >= scene.turns;
    if (done) break;
    await sleep(250);
  }
  // The app scrolls to the answer itself; let the rings grow, then glide down to the cards.
  await sleep(5200);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  const replyDeadline = Date.now() + 40000;
  while (Date.now() < replyDeadline && !(marks.filter((m) => m.kind === 'reply_end').length >= scene.turns)) await sleep(250);
  await sleep(1500);
  marks.push({ t: Date.now() / 1000, kind: 'stop' });
  await cdp.send('Page.stopScreencast');
  await sleep(300);
  await browser.close();

  // Frames -> constant 30 fps H.264.
  const t0 = frames[0].t;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : f.t + 0.5;
    lines.push(`file 'frames/${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file 'frames/${frames[frames.length - 1].file}'`);
  fs.writeFileSync(path.join(dir, 'frames.ffconcat'), lines.join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat',
    '-vf', 'fps=30,scale=780:1688:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow',
    'screen.mp4'], { cwd: dir });
  fs.rmSync(path.join(dir, 'frames'), { recursive: true, force: true });
  fs.rmSync(path.join(dir, 'frames.ffconcat'));

  const rel = (t) => Math.round((t - t0) * 1000) / 1000;
  const meta = {
    scene: name,
    duration: rel(frames[frames.length - 1].t + 0.5),
    marks: marks.map((m) => ({ ...m, t: rel(m.t), data: typeof m.data === 'string' ? m.data.replace(/^.*\/media\//, '') : m.data })),
    asks: asks.map((a) => ({ ...a, t: rel(a.t) })),
  };
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(meta, null, 2));
  console.log(`${name}: ${meta.duration}s, ${frames.length} frames, ${asks.length} answers ->`,
    asks.map((a) => `${a.body.status}/${a.body.heard?.language}/${a.ms}ms`).join(', '));
}

for (const s of process.argv.slice(2)) await record(s);
