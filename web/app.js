// Jeevan Dhara web client.
// Plain ES module, no framework. All server and user text goes into the DOM through
// textContent / attributes only — never innerHTML.

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MAX_REC = 30;
const WARN_REC = 25;
const LEAFLET = {
  base: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/',
  css: 'sha384-c6Rcwz4e4CITMbu/NBmnNS8yN2sC3cUElMEMfP3vqqKFp7GOYaaBBCqmaWBjmkjb',
  js: 'sha384-NElt3Op+9NBMCYaef5HxeJmU4Xeard/Lku8ek6hoPTvYkQPh3zLIrJP7KiRocsxO',
};
const FALLBACK_CONFIG = {
  demo_mode: false,
  languages: [
    { code: 'hi-IN', name: 'हिन्दी', ui: 'hi' },
    { code: 'en-IN', name: 'English', ui: 'en' },
    { code: 'kn-IN', name: 'ಕನ್ನಡ', ui: 'en' },
    { code: 'ta-IN', name: 'தமிழ்', ui: 'en' },
    { code: 'te-IN', name: 'తెలుగు', ui: 'en' },
    { code: 'ml-IN', name: 'മലയാളം', ui: 'en' },
    { code: 'mr-IN', name: 'मराठी', ui: 'en' },
    { code: 'bn-IN', name: 'বাংলা', ui: 'en' },
    { code: 'gu-IN', name: 'ગુજરાતી', ui: 'en' },
    { code: 'pa-IN', name: 'ਪੰਜਾਬੀ', ui: 'en' },
    { code: 'hinglish', name: 'Hinglish', ui: 'en' },
  ],
  blood_groups: GROUPS,
  emergency: { ambulance: '108', helpline: '104' },
};
const EN_NAMES = {
  hi: 'Hindi', en: 'English', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
  mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', hinglish: 'Hindi + English',
};
const SCRIPT_FONT = {
  hi: 'Devanagari', mr: 'Devanagari', bn: 'Bengali', gu: 'Gujarati', pa: 'Gurmukhi',
  kn: 'Kannada', ml: 'Malayalam', ta: 'Tamil', te: 'Telugu',
};
const UI_LANGS = ['en', 'hi'];
const PR_EN = new Intl.PluralRules('en');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  config: FALLBACK_CONFIG,
  me: { authenticated: false, phone_masked: null, is_donor: false },
  lang: 'en-IN',
  ui: 'en',
  pr: PR_EN,
  en: {},
  dict: {},
  loc: null,          // { lat, lng, accuracy } from GPS
  geo: 'prompt',      // permission state: prompt | granted | denied | unsupported
  locating: false,
  requestId: null,
  pendingClarify: false,
  component: 'whole_blood',
  last: null,
  busy: false,
  retry: null,
  rate: 1,
  phone: '',
  donor: null,
  donorFormOpen: false,
};

// ---------- small DOM helpers ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function icon(name, cls = 'icon') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', `#i-${name}`);
  s.append(u);
  return s;
}
function setIcon(btn, name) { const u = $('use', btn); if (u) u.setAttribute('href', `#i-${name}`); }
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const fmtGroup = (g) => (typeof g === 'string' ? g.replace('-', '−') : '');
const isGroup = (g) => GROUPS.includes(g);
const finite = (...xs) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));
const clock = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtKm = (d) => (finite(d) ? `${d < 10 ? d.toFixed(1) : Math.round(d)} km` : '');
const langAttr = (code) => (typeof code === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code) ? code : '');
const vibrate = () => { try { navigator.vibrate?.(20); } catch { /* unsupported */ } };

// ---------- i18n ----------
async function loadDict(ui) {
  try {
    const r = await fetch(`i18n/${ui}.json`, { credentials: 'same-origin' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function has(key) { return key in state.dict || key in state.en; }
function t(key, vars = {}) {
  const n = vars.n;
  const pick = (d, rules) => {
    if (typeof n === 'number') {
      const v = d[`${key}_${rules.select(n)}`];
      if (v != null) return v;
    }
    return d[key];
  };
  const s = pick(state.dict, state.pr) ?? pick(state.en, PR_EN) ?? key;
  return String(s).replace(/\{(\w+)\}/g, (m, v) => (v in vars ? String(vars[v]) : m));
}
function applyI18n(root = document) {
  $$('[data-i18n]', root).forEach((n) => { if (has(n.dataset.i18n)) n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-aria]', root).forEach((n) => { if (has(n.dataset.i18nAria)) n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
  $$('[data-i18n-ph]', root).forEach((n) => { if (has(n.dataset.i18nPh)) n.placeholder = t(n.dataset.i18nPh); });
}
const locale = () => (state.ui === 'hi' ? 'hi-IN-u-nu-latn' : 'en-IN');

const loadedScripts = new Set();
function loadScriptFont(code) {
  const script = SCRIPT_FONT[String(code || '').slice(0, 2)];
  if (!script || loadedScripts.has(script)) return;
  loadedScripts.add(script);
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=Noto+Sans+${script}:wght@400;600;700&display=swap`;
  document.head.append(link);
  document.documentElement.style.setProperty('--font-script', [...loadedScripts].map((s) => `"Noto Sans ${s}"`).join(', '));
}

// ---------- API ----------
class ApiError extends Error {
  constructor(status, detail) { super(detail || `HTTP ${status}`); this.status = status; this.detail = detail; }
}
async function api(path, { method = 'GET', json, form, timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const opt = { method, credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl.signal };
  if (json !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(json); }
  if (form) opt.body = form;
  let res;
  try {
    res = await fetch(path, opt);
  } catch (e) {
    throw new ApiError(0, e && e.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) {
    try { data = await res.json(); } catch { data = null; }
  }
  if (!res.ok) throw new ApiError(res.status, data && typeof data.detail === 'string' ? data.detail : null);
  return data;
}
function errorText(err) {
  const s = err && err.status;
  if (s === 0) {
    if (err.detail === 'timeout') return t('err_timeout');
    return navigator.onLine === false ? t('err_offline') : t('err_network');
  }
  if (s === 429) return t('err_rate');
  if (s === 401) return t('err_signin');
  if (s >= 400 && s < 500 && err.detail) return err.detail;
  return t('err_generic');
}

// ---------- status, alerts, toast ----------
const live = $('#live');
function announce(msg) {
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 60);
}
let toastTimer = 0;
function toast(msg) {
  const box = $('#toast');
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4000);
}
function showAlert(box, kind, text, action) {
  box.replaceChildren(icon(kind === 'error' ? 'error' : 'warning'), el('p', null, text));
  box.className = `alert alert-${kind}`;
  if (action) {
    const b = el('button', 'text-btn', action.label);
    b.type = 'button';
    b.addEventListener('click', action.fn);
    box.append(b);
  }
  box.hidden = false;
}
function clearAlert(box) { box.hidden = true; box.replaceChildren(); }
function setFieldError(p, text) {
  if (!text) { p.hidden = true; p.replaceChildren(); return; }
  p.replaceChildren(icon('error'), el('span', null, text));
  p.hidden = false;
}

// ---------- elements ----------
const findPanel = $('#panel-find');
const findAlert = $('#findAlert');
const form = $('#searchForm');
const groupSel = $('#group');
const unitsIn = $('#units');
const placeIn = $('#place');
const speakBtn = $('#speakBtn');
const cancelBtn = $('#cancelRec');
const audio = $('#replyAudio');

// ---------- location ----------
const locFields = [];
function makeLocField(btn, input, note, defaultNote) {
  const f = { btn, input, note, defaultNote, useGps: false };
  btn.addEventListener('click', async () => {
    if (f.useGps) { f.useGps = false; renderLoc(); input.focus(); return; }
    const loc = await locate();
    if (loc) f.useGps = true;
    renderLoc();
  });
  input.addEventListener('input', () => {
    if (f.useGps && input.value.trim()) { f.useGps = false; renderLoc(); }
  });
  locFields.push(f);
  return f;
}
const searchLoc = makeLocField($('#gpsBtn'), placeIn, $('#locNote'), 'loc_explain');
const donorLoc = makeLocField($('#dGpsBtn'), $('#dPlace'), $('#dLocNote'), 'area_note');

function renderLoc() {
  for (const f of locFields) {
    const label = $('.loc-chip-text', f.btn);
    const on = f.useGps && !!state.loc;
    f.btn.setAttribute('aria-pressed', String(on));
    f.btn.setAttribute('aria-busy', String(state.locating));
    f.btn.hidden = state.geo === 'unsupported';
    if (state.locating) label.textContent = t('locating');
    else if (on) label.textContent = t('loc_on', { m: state.loc.accuracy });
    else label.textContent = t('use_location');
    let note = f.defaultNote;
    if (state.geo === 'denied' && !on) note = 'loc_denied';
    else if (on && f === searchLoc) note = 'loc_using';
    else if (f === searchLoc && state.geo === 'granted') note = 'loc_type';
    f.note.textContent = t(note);
  }
}
async function initGeo() {
  if (!('geolocation' in navigator)) { state.geo = 'unsupported'; renderLoc(); return; }
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    if (p) {
      state.geo = p.state;
      p.onchange = () => { state.geo = p.state; renderLoc(); };
    }
  } catch { /* permissions API missing */ }
  renderLoc();
  if (state.geo === 'granted') {
    const loc = await locate();
    if (loc && !placeIn.value.trim()) { searchLoc.useGps = true; renderLoc(); }
  }
}
function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    state.locating = true;
    renderLoc();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        state.loc = { lat: +c.latitude.toFixed(5), lng: +c.longitude.toFixed(5), accuracy: Math.max(1, Math.round(c.accuracy)) };
        state.locating = false;
        state.geo = 'granted';
        renderLoc();
        resolve(state.loc);
      },
      (err) => {
        state.locating = false;
        if (err.code === 1) state.geo = 'denied';
        renderLoc();
        announce(err.code === 1 ? t('loc_denied') : t('loc_failed'));
        if (err.code !== 1) toast(t('loc_failed'));
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
function locPayload(f) {
  if (f.useGps && state.loc) return { lat: state.loc.lat, lng: state.loc.lng, accuracy: state.loc.accuracy, place: null };
  const place = f.input.value.trim();
  return { lat: null, lng: null, accuracy: null, place: place || null };
}

// ---------- units stepper ----------
function clampUnits(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
}
function setUnits(v) {
  unitsIn.value = clampUnits(v);
  $('#unitsDown').disabled = +unitsIn.value <= 1;
  $('#unitsUp').disabled = +unitsIn.value >= 10;
}
$('#unitsDown').addEventListener('click', () => { setUnits(+unitsIn.value - 1); clearUnsure('units'); });
$('#unitsUp').addEventListener('click', () => { setUnits(+unitsIn.value + 1); clearUnsure('units'); });
unitsIn.addEventListener('change', () => { setUnits(unitsIn.value); clearUnsure('units'); });
groupSel.addEventListener('change', () => clearUnsure('blood_group'));
placeIn.addEventListener('input', () => clearUnsure('place'));
setUnits(1);

const FIELD_WRAP = { blood_group: '#fGroup', units: '#fUnits', place: '#fPlace', location: '#fPlace' };
function clearUnsure(field) {
  const w = $(FIELD_WRAP[field] || '#none');
  if (w) w.classList.remove('is-unsure');
  $$(`#heardChips .chip[data-field="${field}"]`).forEach((c) => c.classList.remove('is-unsure'));
  if (!$('#heardChips .chip.is-unsure')) $('#heardNote').hidden = true;
}

// ---------- speak button / recording ----------
const rec = {
  stream: null, mr: null, chunks: [], start: 0, timer: 0, raf: 0, ctx: null, level: 0,
  mode: null, holding: false, starting: false, cancelled: false, send: false, dur: 0,
  pressAt: 0, startX: 0, lastPointer: 0,
};
function pickMime() {
  if (!window.MediaRecorder) return null;
  const list = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return '';
}
const voiceOk = pickMime() !== null && !!navigator.mediaDevices?.getUserMedia;

let stepTimer = 0;
function setSpeak(mode, label) {
  speakBtn.dataset.state = mode;
  const timer = $('#speakTimer');
  const hint = $('#speakHint');
  speakBtn.classList.remove('is-warn');
  if (mode === 'recording') {
    $('#speakLabel').textContent = rec.mode === 'tap' ? t('rec_tap_send') : t('rec_release');
    timer.hidden = false;
    cancelBtn.hidden = false;
    hint.textContent = rec.mode === 'tap' ? t('rec_hint_tap') : t('rec_hint_hold');
    speakBtn.removeAttribute('aria-disabled');
  } else if (mode === 'processing') {
    $('#speakLabel').textContent = label;
    timer.hidden = true;
    cancelBtn.hidden = true;
    speakBtn.setAttribute('aria-disabled', 'true');
  } else {
    $('#speakLabel').textContent = t('speak_hold');
    timer.hidden = true;
    timer.textContent = `0:00 / ${clock(MAX_REC)}`;
    cancelBtn.hidden = true;
    hint.textContent = t('speak_hint');
    speakBtn.removeAttribute('aria-disabled');
    speakBtn.style.setProperty('--level', '0');
  }
}

speakBtn.addEventListener('contextmenu', (e) => e.preventDefault());
speakBtn.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  rec.lastPointer = performance.now();
  if (state.busy) return;
  if (!voiceOk) { noVoice(); return; }
  if (rec.mr && rec.mode === 'tap') { stopRecording(true); return; }
  if (rec.mr || rec.starting) return;
  e.preventDefault();
  rec.pressAt = performance.now();
  rec.startX = e.clientX;
  rec.holding = true;
  rec.mode = 'hold';
  try { speakBtn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  speakBtn.focus({ preventScroll: true });
  startRecording();
});
speakBtn.addEventListener('pointermove', (e) => {
  if (rec.holding && rec.mr && rec.mode === 'hold' && e.clientX - rec.startX < -80) {
    rec.holding = false;
    stopRecording(false);
  }
});
speakBtn.addEventListener('pointerup', () => {
  rec.lastPointer = performance.now();
  if (!rec.holding) return;
  rec.holding = false;
  const held = performance.now() - rec.pressAt;
  if (rec.starting || !rec.mr || held < 350) {
    // A quick tap (or release during the permission prompt) switches to tap-to-stop mode.
    rec.mode = 'tap';
    if (rec.mr) setSpeak('recording');
  } else {
    stopRecording(true);
  }
});
speakBtn.addEventListener('pointercancel', () => {
  rec.lastPointer = performance.now();
  if (!rec.holding) return;
  rec.holding = false;
  if (rec.mr && rec.mode === 'hold') stopRecording(false);
});
speakBtn.addEventListener('click', () => {
  // Keyboard and assistive-tech activation: no pointer sequence came first.
  if (performance.now() - rec.lastPointer < 800) return;
  if (state.busy) return;
  if (!voiceOk) { noVoice(); return; }
  if (rec.mr) { stopRecording(true); return; }
  rec.mode = 'tap';
  startRecording();
});
cancelBtn.addEventListener('click', () => { stopRecording(false); speakBtn.focus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (rec.mr || rec.starting)) stopRecording(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (rec.mr || rec.starting)) stopRecording(false); });

function noVoice() { showAlert(findAlert, 'warn', t('err_no_voice')); }

async function startRecording() {
  if (rec.starting || rec.mr) return;
  clearAlert(findAlert);
  stopReply();
  rec.starting = true;
  rec.cancelled = false;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    rec.starting = false;
    rec.mode = null;
    rec.holding = false;
    setSpeak('idle');
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    showAlert(findAlert, 'warn', denied ? t('err_mic_denied') : t('err_mic_none'));
    return;
  }
  rec.starting = false;
  if (rec.cancelled) { stream.getTracks().forEach((tr) => tr.stop()); rec.mode = null; setSpeak('idle'); return; }
  rec.stream = stream;
  rec.chunks = [];
  const mime = pickMime();
  try {
    rec.mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
  } catch {
    rec.mr = new MediaRecorder(stream);
  }
  rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = onRecStop;
  rec.mr.start(250);
  rec.start = performance.now();
  vibrate();
  meterStart();
  rec.timer = setInterval(tick, 200);
  setSpeak('recording');
  tick();
  announce(t('st_recording'));
}
function tick() {
  if (!rec.mr) return;
  const s = (performance.now() - rec.start) / 1000;
  $('#speakTimer').textContent = `${clock(s)} / ${clock(MAX_REC)}`;
  speakBtn.classList.toggle('is-warn', s >= WARN_REC);
  if (s >= MAX_REC) stopRecording(true);
}
function stopRecording(send) {
  if (!rec.mr) {
    if (rec.starting) rec.cancelled = true;
    return;
  }
  if (rec.stopping) return;
  rec.stopping = true;
  rec.send = send;
  rec.dur = (performance.now() - rec.start) / 1000;
  clearInterval(rec.timer);
  meterStop();
  vibrate();
  try { if (rec.mr.state !== 'inactive') rec.mr.stop(); else onRecStop(); } catch { onRecStop(); }
}
function releaseStream() {
  if (rec.stream) rec.stream.getTracks().forEach((tr) => tr.stop());
  rec.stream = null;
}
function onRecStop() {
  const mr = rec.mr;
  if (!mr) return;
  rec.mr = null;
  rec.stopping = false;
  rec.mode = null;
  rec.holding = false;
  releaseStream();
  const type = (mr.mimeType || 'audio/webm').split(';')[0];
  const blob = new Blob(rec.chunks, { type });
  rec.chunks = [];
  setSpeak('idle');
  if (!rec.send) { announce(t('st_cancelled')); return; }
  if (rec.dur < 0.7 || blob.size < 800) { toast(t('err_too_short')); return; }
  sendAudio(blob);
}
function meterStart() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    rec.ctx = new AC();
    const src = rec.ctx.createMediaStreamSource(rec.stream);
    const an = rec.ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    rec.level = 0;
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5);
      rec.level = rec.level * 0.6 + lvl * 0.4;
      speakBtn.style.setProperty('--level', rec.level.toFixed(3));
      rec.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch { /* level ring is optional */ }
}
function meterStop() {
  cancelAnimationFrame(rec.raf);
  if (rec.ctx) { rec.ctx.close().catch(() => {}); rec.ctx = null; }
  speakBtn.style.setProperty('--level', '0');
}

// ---------- requests to the search API ----------
function startSteps(keys) {
  state.busy = true;
  $('#searchBtn').disabled = true;
  let i = 0;
  setSpeak('processing', t(keys[0]));
  announce(t(keys[0]));
  clearInterval(stepTimer);
  stepTimer = setInterval(() => {
    if (i < keys.length - 1) { i += 1; setSpeak('processing', t(keys[i])); }
  }, 1500);
  hideFindSections();
  $('#skeleton').hidden = false;
}
function endSteps() {
  clearInterval(stepTimer);
  state.busy = false;
  $('#searchBtn').disabled = false;
  setSpeak('idle');
  $('#skeleton').hidden = true;
}
function hideFindSections() {
  ['#heard', '#clarify', '#player', '#summary', '#results', '#donorBox', '#empty'].forEach((s) => { $(s).hidden = true; });
}
async function run(call, steps) {
  if (state.busy) return;
  clearAlert(findAlert);
  stopReply();
  startSteps(steps);
  try {
    const resp = await call();
    endSteps();
    if (!resp || typeof resp !== 'object') throw new ApiError(500, null);
    render(resp, true);
  } catch (err) {
    endSteps();
    handleFindError(err, () => run(call, steps));
  }
}
function handleFindError(err, retry) {
  if (state.last) render(state.last, false);
  if (err.status === 401) { openAuth(retry); return; }
  if (err.status === 0 && navigator.onLine === false) {
    state.retry = retry;
    showAlert(findAlert, 'error', t('err_offline'));
    announce(t('err_offline'));
    return;
  }
  const text = errorText(err);
  showAlert(findAlert, 'error', text, err.status === 429 ? null : { label: t('retry'), fn: retry });
  announce(text);
}
window.addEventListener('online', () => {
  const r = state.retry;
  state.retry = null;
  if (r) r();
});

function sendAudio(blob) {
  const fd = new FormData();
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : blob.type.includes('aac') ? 'aac' : 'webm';
  fd.append('audio', blob, `speech.${ext}`);
  const loc = locPayload(searchLoc);
  if (loc.lat != null) {
    fd.append('lat', String(loc.lat));
    fd.append('lng', String(loc.lng));
    fd.append('accuracy', String(loc.accuracy));
  }
  if (loc.place) fd.append('place', loc.place);
  if (state.pendingClarify && state.requestId) fd.append('request_id', state.requestId);
  fd.append('ui_lang', state.lang);
  run(() => api('/api/ask', { method: 'POST', form: fd, timeout: 60000 }), ['st_listening', 'st_understanding', 'st_searching']);
}
function doSearch(over = {}) {
  const loc = locPayload(searchLoc);
  const body = {
    blood_group: isGroup(groupSel.value) ? groupSel.value : null,
    component: state.component || 'whole_blood',
    units: clampUnits(unitsIn.value),
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    place: loc.place,
    request_id: state.pendingClarify ? state.requestId : null,
    lang: state.lang,
    ...over,
  };
  run(() => api('/api/search', { method: 'POST', json: body }), ['st_searching']);
}
form.addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });

// ---------- render a SearchResponse ----------
function render(resp, fresh) {
  state.last = resp;
  if (resp.request_id) state.requestId = String(resp.request_id);
  state.pendingClarify = resp.status === 'clarify';
  if (resp.emergency) setEmergency(resp.emergency);
  renderHeard(resp.heard, fresh);
  renderClarify(resp, fresh);
  renderPlayer(resp.reply, fresh);
  renderResults(resp, fresh);
}

const COMPONENT_KEYS = { whole_blood: 'comp_whole', packed_red_cells: 'comp_prbc', prbc: 'comp_prbc', platelets: 'comp_platelets', plasma: 'comp_plasma', ffp: 'comp_plasma' };
function compLabel(c) { return COMPONENT_KEYS[c] ? t(COMPONENT_KEYS[c]) : String(c).replace(/_/g, ' '); }

function renderHeard(h, fresh) {
  const box = $('#heard');
  if (!h || typeof h !== 'object') { box.hidden = true; return; }
  const unsure = new Set(Array.isArray(h.low_confidence) ? h.low_confidence : []);
  if (fresh) {
    if (isGroup(h.blood_group)) groupSel.value = h.blood_group;
    if (finite(h.units)) setUnits(h.units);
    if (h.component) state.component = h.component;
    if (h.place && typeof h.place === 'string') {
      placeIn.value = h.place;
      if (h.location_source === 'spoken' || h.location_source === 'pin') searchLoc.useGps = false;
      renderLoc();
    }
    for (const k of Object.keys(FIELD_WRAP)) $(FIELD_WRAP[k]).classList.remove('is-unsure');
    unsure.forEach((f) => { const w = $(FIELD_WRAP[f] || '#none'); if (w) w.classList.add('is-unsure'); });
  }
  const chips = $('#heardChips');
  chips.replaceChildren();
  const addChip = (field, text, cls, iconName) => {
    if (!text) return;
    const li = el('li');
    const b = el('button', `chip ${cls || ''}`.trim());
    b.type = 'button';
    b.dataset.field = field;
    if (iconName) b.append(icon(iconName));
    b.append(el('span', null, text));
    if (unsure.has(field) || (field === 'place' && unsure.has('location'))) {
      b.classList.add('is-unsure');
      b.prepend(icon('warning'));
      b.append(el('span', 'vh', ` (${t('not_sure')})`));
    }
    b.addEventListener('click', () => {
      const target = { blood_group: groupSel, units: unitsIn, component: groupSel, place: placeIn }[field];
      if (target) { target.focus(); target.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' }); }
    });
    li.append(b);
    chips.append(li);
  };
  addChip('blood_group', isGroup(h.blood_group) ? fmtGroup(h.blood_group) : '', 'chip-group');
  addChip('units', finite(h.units) ? t('units_n', { n: h.units }) : '');
  if (h.component && h.component !== 'whole_blood') addChip('component', compLabel(h.component));
  const placeText = h.place || (h.location_source === 'gps' ? t('your_location') : '');
  addChip('place', placeText, '', 'place');
  $('#heardNote').hidden = !chips.querySelector('.is-unsure');
  const tr = $('#transcript');
  if (h.transcript) {
    tr.textContent = h.transcript;
    const la = langAttr(h.language);
    if (la) tr.lang = la; else tr.removeAttribute('lang');
    loadScriptFont(h.language);
    tr.hidden = false;
  } else {
    tr.hidden = true;
  }
  box.hidden = !chips.children.length && tr.hidden;
}

function renderClarify(resp, fresh) {
  const c = resp.status === 'clarify' && resp.clarify;
  const box = $('#clarify');
  box.hidden = !c;
  if (!c) return;
  const q = $('#clarifyQ');
  const field = c.field;
  q.textContent = c.question || t(field === 'location' ? 'clarify_location' : 'clarify_group');
  const la = c.question && langAttr(resp.reply?.language || resp.heard?.language);
  if (la) q.lang = la; else q.removeAttribute('lang');
  if (c.question) loadScriptFont(resp.reply?.language || resp.heard?.language);
  const grid = $('#clarifyGroups');
  grid.hidden = field !== 'blood_group';
  $('#clarifyLoc').hidden = field !== 'location';
  $('#clarifyOther').hidden = field === 'blood_group' || field === 'location';
  if (field === 'blood_group') {
    grid.replaceChildren();
    const groups = Array.isArray(state.config.blood_groups) ? state.config.blood_groups.filter(isGroup) : GROUPS;
    (groups.length ? groups : GROUPS).forEach((g) => {
      const b = el('button', 'group-btn', fmtGroup(g));
      b.type = 'button';
      b.addEventListener('click', () => { groupSel.value = g; clearUnsure('blood_group'); doSearch({ blood_group: g }); });
      grid.append(b);
    });
  }
  if (fresh) {
    q.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    announce(q.textContent);
  }
}
$('#clarifyGps').addEventListener('click', async () => {
  const loc = await locate();
  if (!loc) return;
  searchLoc.useGps = true;
  renderLoc();
  doSearch();
});
$('#clarifyPlaceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#clarifyPlace').value.trim();
  if (!v) { $('#clarifyPlace').focus(); return; }
  placeIn.value = v;
  searchLoc.useGps = false;
  renderLoc();
  doSearch();
});

// ---------- reply audio player ----------
function safeMediaUrl(u) {
  if (typeof u !== 'string' || !u) return null;
  try {
    const x = new URL(u, location.href);
    if (x.origin !== location.origin || !/^https?:$/.test(x.protocol)) return null;
    return x.href;
  } catch { return null; }
}
function renderPlayer(reply, fresh) {
  const box = $('#player');
  const url = reply && safeMediaUrl(reply.audio_url);
  const text = reply && typeof reply.text === 'string' ? reply.text : '';
  box.hidden = !(url || text);
  if (box.hidden) { stopReply(); return; }
  const rt = $('#replyText');
  rt.textContent = text;
  rt.hidden = !text;
  const la = langAttr(reply.language);
  if (la) rt.lang = la; else rt.removeAttribute('lang');
  loadScriptFont(reply.language);
  $('#playerCtl').hidden = !url;
  if (!url) { stopReply(); return; }
  if (audio.src !== url) {
    audio.src = url;
    $('#playerBar').style.setProperty('--p', '0');
    $('#playerTime').textContent = '0:00';
  }
  audio.playbackRate = state.rate;
  if (fresh) audio.play().catch(() => { /* autoplay blocked: the play button stays visible */ });
}
function stopReply() { try { audio.pause(); } catch { /* ignore */ } }
function syncPlayBtn() {
  const playing = !audio.paused && !audio.ended;
  const b = $('#playBtn');
  setIcon(b, playing ? 'pause' : 'play');
  b.setAttribute('aria-label', playing ? t('pause') : t('play'));
}
audio.addEventListener('play', syncPlayBtn);
audio.addEventListener('pause', syncPlayBtn);
audio.addEventListener('ended', syncPlayBtn);
audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  const p = Number.isFinite(d) && d > 0 ? audio.currentTime / d : 0;
  $('#playerBar').style.setProperty('--p', p.toFixed(4));
  $('#playerTime').textContent = clock(audio.currentTime);
});
$('#playBtn').addEventListener('click', () => { if (audio.paused || audio.ended) audio.play().catch(() => {}); else audio.pause(); });
$('#replayBtn').addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); });
$('#speedBtn').addEventListener('click', () => {
  state.rate = state.rate === 1 ? 0.8 : 1;
  audio.playbackRate = state.rate;
  syncSpeed();
});
function syncSpeed() {
  const x = state.rate === 1 ? '1×' : '0.8×';
  $('#speedBtn').textContent = x;
  $('#speedBtn').setAttribute('aria-label', t('speed', { x }));
}

// ---------- results ----------
function ringText(s, n) {
  if (!s || !Array.isArray(s.searched_km)) return '';
  const ks = s.searched_km.filter((k) => finite(k)).sort((a, b) => a - b);
  const found = finite(s.found_within_km) ? s.found_within_km : null;
  const misses = ks.filter((k) => found == null || k < found);
  const parts = [];
  if (misses.length) parts.push(t('ring_none', { km: misses[misses.length - 1] }));
  if (found != null && n) parts.push(t('ring_found', { n, km: found }));
  return parts.join(' · ');
}
function maxSearched(s) {
  if (!s) return null;
  const ks = Array.isArray(s.searched_km) ? s.searched_km.filter((k) => finite(k)) : [];
  if (ks.length) return Math.max(...ks);
  return finite(s.max_km) ? s.max_km : null;
}
function renderResults(resp, fresh) {
  const s = resp.search && typeof resp.search === 'object' ? resp.search : null;
  const res = Array.isArray(resp.results) ? resp.results.filter((r) => r && typeof r === 'object') : [];
  const g = isGroup(resp.heard?.blood_group) ? resp.heard.blood_group : (isGroup(groupSel.value) ? groupSel.value : null);
  const hasRes = resp.status === 'results' && res.length > 0;
  const none = resp.status === 'no_results' || (resp.status === 'results' && !res.length);
  $('#summary').hidden = !hasRes;
  $('#results').hidden = !hasRes;
  $('#empty').hidden = !none;
  const exactList = $('#exactList');
  const compatList = $('#compatList');
  exactList.replaceChildren();
  compatList.replaceChildren();

  if (hasRes) {
    res.forEach((r, i) => { if (!finite(r.rank)) r.rank = i + 1; });
    const exact = res.filter((r) => r.match !== 'compatible');
    const compat = res.filter((r) => r.match === 'compatible');
    $('#summaryTitle').textContent = exact.length
      ? (g ? t('res_title', { n: exact.length, group: fmtGroup(g) }) : t('res_title_any', { n: exact.length }))
      : t('res_title_compat', { group: fmtGroup(g) || '' });
    $('#ringLine').textContent = ringText(s, res.length);
    const bits = [];
    if (resp.request_id) bits.push(t('req_id', { id: resp.request_id }));
    if (s && s.approximate) bits.push(t('approx'));
    $('#reqLine').textContent = bits.join(' · ');
    $('#reqLine').hidden = !bits.length;
    exact.forEach((r) => exactList.append(bankCard(r)));
    compat.forEach((r) => compatList.append(bankCard(r)));
    $('#compatTitle').hidden = !compat.length;
    compatList.hidden = !compat.length;
    exactList.hidden = !exact.length;
    if (fresh) announce(`${$('#summaryTitle').textContent}. ${$('#ringLine').textContent}`);
  }

  if (none) {
    const km = maxSearched(s) || 20;
    $('#emptyTitle').textContent = g ? t('none_title', { group: fmtGroup(g), km }) : t('none_title_any', { km });
    $('#emptyRing').textContent = ringText(s, 0);
    $('#emptyRing').hidden = !$('#emptyRing').textContent;
    const ext = $('#extendBtn');
    ext.hidden = !resp.request_id || (s && s.can_extend === false);
    ext.disabled = false;
    if (fresh) {
      $('#emptyDonorMsg').hidden = true;
      announce($('#emptyTitle').textContent);
    }
  }

  const d = resp.donors && typeof resp.donors === 'object' ? resp.donors : null;
  const canAsk = !!resp.request_id && (!d || !finite(d.count) || d.count > 0);
  const donorBox = $('#donorBox');
  donorBox.hidden = !(hasRes && d && finite(d.count) && d.count > 0 && resp.request_id);
  if (!donorBox.hidden) {
    $('#donorText').textContent = finite(d.within_km)
      ? t('donors_line', { n: d.count, km: d.within_km })
      : t('donors_line_any', { n: d.count });
  }
  if (fresh) {
    $('#donorMsg').hidden = true;
    $('#askDonorsBtn').hidden = false;
    $('#askDonorsBtn').disabled = false;
    $('#emptyDonorsBtn').hidden = !canAsk;
    $('#emptyDonorsBtn').disabled = false;
  }

  const showMapNow = (hasRes || none) && s && s.center && finite(s.center.lat, s.center.lng);
  if (showMapNow) drawMap(resp, fresh);
  else { $('#mapWrap').hidden = true; findPanel.classList.remove('has-map'); }
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 864e5);
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  if (diff === 0) return t('when_today', { time });
  if (diff === 1) return t('when_yesterday', { time });
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d);
}
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.length >= 3 ? `tel:${digits}` : null;
}

function bankCard(r) {
  const li = $('#tplBank').content.firstElementChild.cloneNode(true);
  const rank = String(r.rank);
  li.id = `bank-${rank}`;
  li.dataset.rank = rank;
  if (r.match === 'compatible') li.classList.add('is-compat');
  $('.bank-rank', li).textContent = rank;
  $('.bank-name', li).textContent = r.name || '';
  $('.bank-dist', li).textContent = fmtKm(r.distance_km);
  $('.group-chip', li).textContent = fmtGroup(r.blood_group);
  $('.bank-units', li).textContent = finite(r.units) ? t('units_n', { n: r.units }) : '';
  const up = $('.bank-updated', li);
  const when = r.updated_at ? fmtWhen(r.updated_at) : null;
  if (r.stale) {
    const badge = el('span', 'badge-stale');
    badge.append(icon('warning', 'icon i-small'), el('span', null, when ? t('stale_badge', { when }) : t('stale_plain')));
    up.append(badge);
  } else if (when) {
    up.append(icon('schedule'), el('span', null, t('updated', { when })));
  } else {
    up.hidden = true;
  }
  const meta = [r.type, r.hours, r.area].filter((x) => typeof x === 'string' && x.trim()).join(' · ');
  $('.bank-meta', li).textContent = meta;
  $('.bank-meta', li).hidden = !meta;
  const call = $('.bank-call', li);
  const tel = telHref(r.phone);
  $('.lbl-call', li).textContent = t('call');
  if (tel) {
    call.href = tel;
    call.setAttribute('aria-label', t('call_bank', { name: r.name || '' }));
  } else {
    call.removeAttribute('href');
    call.setAttribute('aria-disabled', 'true');
  }
  const dir = $('.bank-dir', li);
  $('.lbl-dir', li).textContent = t('directions');
  if (finite(r.lat, r.lng)) {
    dir.href = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
    dir.setAttribute('aria-label', t('dir_bank', { name: r.name || '' }));
  } else {
    dir.hidden = true;
  }
  li.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    selectBank(rank, false);
  });
  return li;
}

// ---------- map (Leaflet, lazy) ----------
let leafletPromise = null;
let map = null;
let mapLayer = null;
let markers = new Map();
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = el('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET.base}leaflet.min.css`;
    css.integrity = LEAFLET.css;
    css.crossOrigin = 'anonymous';
    css.referrerPolicy = 'no-referrer';
    document.head.append(css);
    const js = el('script');
    js.src = `${LEAFLET.base}leaflet.min.js`;
    js.integrity = LEAFLET.js;
    js.crossOrigin = 'anonymous';
    js.referrerPolicy = 'no-referrer';
    js.async = true;
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('leaflet')));
    js.onerror = () => { leafletPromise = null; js.remove(); reject(new Error('leaflet')); };
    document.head.append(js);
  });
  return leafletPromise;
}
async function drawMap(resp, fresh) {
  const wrap = $('#mapWrap');
  wrap.hidden = false;
  findPanel.classList.add('has-map');
  let L;
  try { L = await loadLeaflet(); } catch {
    wrap.hidden = true;
    findPanel.classList.remove('has-map');
    return;
  }
  if (state.last !== resp) return;
  const mapEl = $('#map');
  if (!map) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
  }
  map.invalidateSize();
  mapLayer.clearLayers();
  markers = new Map();
  const s = resp.search;
  const c = [s.center.lat, s.center.lng];
  const ks = (Array.isArray(s.searched_km) ? s.searched_km : []).filter((k) => finite(k) && k > 0);
  const found = finite(s.found_within_km) ? s.found_within_km : null;
  const grow = fresh && found != null && ks.length > 1 && !reduced.matches;
  ks.forEach((km) => {
    const isFound = km === found;
    L.circle(c, {
      radius: km * 1000,
      color: isFound ? '#D32F2F' : '#6B7785',
      weight: isFound ? 2 : 1.5,
      opacity: isFound ? 0.9 : 0.7,
      dashArray: isFound ? null : '6 6',
      fill: false,
      interactive: false,
      className: isFound && grow ? 'ring-grow' : '',
    }).addTo(mapLayer);
  });
  const useYou = state.loc && (searchLoc.useGps || resp.heard?.location_source === 'gps');
  if (useYou) {
    const y = [state.loc.lat, state.loc.lng];
    L.circle(y, { radius: state.loc.accuracy, color: '#1976D2', weight: 1, opacity: 0.6, fillColor: '#1976D2', fillOpacity: 0.12, interactive: false }).addTo(mapLayer);
    L.circleMarker(y, { radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#1976D2', fillOpacity: 1 })
      .bindTooltip(t('you_here'))
      .addTo(mapLayer);
  } else {
    L.circleMarker(c, { radius: 6, color: '#1F2933', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 })
      .bindTooltip(t('search_centre'))
      .addTo(mapLayer);
  }
  const res = Array.isArray(resp.results) ? resp.results : [];
  res.forEach((r) => {
    if (!r || !finite(r.lat, r.lng)) return;
    const rank = String(r.rank);
    const node = el('div', r.match === 'compatible' ? 'pin pin-compat' : 'pin');
    node.append(el('span', 'pin-n', rank));
    const m = L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: 'pin-icon', html: node, iconSize: [30, 30], iconAnchor: [15, 36] }),
      title: `${rank}. ${r.name || ''}`,
      alt: r.name || '',
      keyboard: true,
      riseOnHover: true,
    }).addTo(mapLayer);
    m.on('click', () => selectBank(rank, true));
    markers.set(rank, m);
  });
  // Fit the pins and the centre; with no pins, fit the largest searched ring.
  const fitKm = markers.size ? 1 : (found || (ks.length ? Math.max(...ks) : 5));
  let bounds = L.latLng(c).toBounds(fitKm * 2000);
  markers.forEach((m) => { bounds = bounds.extend(m.getLatLng()); });
  if (useYou) bounds = bounds.extend([state.loc.lat, state.loc.lng]);
  map.fitBounds(bounds, { padding: [16, 16], animate: false });
}
function selectBank(rank, fromPin) {
  $$('.bank.is-active').forEach((n) => n.classList.remove('is-active'));
  markers.forEach((m) => { m.getElement()?.classList.remove('is-active'); m.setZIndexOffset(0); });
  const card = document.getElementById(`bank-${rank}`);
  if (card) card.classList.add('is-active');
  const m = markers.get(String(rank));
  if (m) {
    m.getElement()?.classList.add('is-active');
    m.setZIndexOffset(1000);
    if (!fromPin && map && !map.getBounds().contains(m.getLatLng())) map.panTo(m.getLatLng(), { animate: !reduced.matches });
  }
  if (fromPin && card) {
    card.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    card.focus({ preventScroll: true });
  }
}

// ---------- extend / ask donors ----------
$('#extendBtn').addEventListener('click', () => {
  const id = state.requestId;
  if (!id) return;
  run(() => api(`/api/search/${encodeURIComponent(id)}/extend`, { method: 'POST' }), ['st_searching_wide']);
});
async function askDonors(btn, msg) {
  const id = state.requestId;
  if (!id || btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  msg.hidden = true;
  try {
    const r = await api(`/api/requests/${encodeURIComponent(id)}/ask-donors`, { method: 'POST' });
    const n = r && finite(r.pinged) ? r.pinged : 0;
    const text = r && typeof r.message === 'string' && r.message ? r.message : t('donors_asked', { n });
    msg.replaceChildren(icon('check'), el('span', null, text));
    msg.className = 'ok-line';
    msg.hidden = false;
    btn.hidden = true;
    announce(text);
  } catch (err) {
    btn.disabled = false;
    if (err.status === 401) { openAuth(() => askDonors(btn, msg)); return; }
    msg.replaceChildren(icon('error'), el('span', null, errorText(err)));
    msg.className = 'field-err';
    msg.hidden = false;
  } finally {
    btn.removeAttribute('aria-busy');
  }
}
$('#askDonorsBtn').addEventListener('click', () => askDonors($('#askDonorsBtn'), $('#donorMsg')));
$('#emptyDonorsBtn').addEventListener('click', () => askDonors($('#emptyDonorsBtn'), $('#emptyDonorMsg')));

// ---------- emergency numbers ----------
function setEmergency(e) {
  const amb = /^\d{3,5}$/.test(String(e?.ambulance || '')) ? String(e.ambulance) : '108';
  const help = /^\d{3,5}$/.test(String(e?.helpline || '')) ? String(e.helpline) : '104';
  $$('[data-em="ambulance"]').forEach((n) => { n.textContent = amb; });
  $$('[data-em="helpline"]').forEach((n) => { n.textContent = help; });
  ['#footAmb', '#emAmb'].forEach((s) => { $(s).href = `tel:${amb}`; });
  ['#footHelp', '#emHelp'].forEach((s) => { $(s).href = `tel:${help}`; });
}

// ---------- tabs ----------
const tabs = $$('[role="tab"]');
function selectTab(name, focus) {
  tabs.forEach((tb) => {
    const on = tb.dataset.tab === name;
    tb.setAttribute('aria-selected', String(on));
    tb.tabIndex = on ? 0 : -1;
    $(`#panel-${tb.dataset.tab}`).hidden = !on;
    if (on && focus) tb.focus();
  });
  if (name === 'donate') loadDonor();
  if (name === 'requests') loadRequests();
  if (name === 'find' && map) setTimeout(() => map.invalidateSize(), 0);
  if (name !== 'find' && (rec.mr || rec.starting)) stopRecording(false);
  window.scrollTo({ top: 0 });
}
tabs.forEach((tb) => tb.addEventListener('click', () => selectTab(tb.dataset.tab)));
$('[role="tablist"]').addEventListener('keydown', (e) => {
  const i = tabs.findIndex((tb) => tb.getAttribute('aria-selected') === 'true');
  let j = null;
  if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tabs.length - 1;
  if (j == null) return;
  e.preventDefault();
  selectTab(tabs[j].dataset.tab, true);
});

// ---------- sheets ----------
function openSheet(d) {
  if (d.open) return;
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}
function closeSheet(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
$$('dialog.sheet').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) closeSheet(d); });
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeSheet(d)));
});

// ---------- language ----------
function languages() {
  const ls = state.config.languages;
  return Array.isArray(ls) && ls.length ? ls.filter((l) => l && typeof l.code === 'string') : FALLBACK_CONFIG.languages;
}
function uiFor(l) {
  if (l && UI_LANGS.includes(l.ui)) return l.ui;
  const p = String(l?.code || '').slice(0, 2);
  return l?.ui == null && UI_LANGS.includes(p) && l.code !== 'hinglish' ? p : 'en';
}
function buildLangList() {
  const ul = $('#langList');
  ul.replaceChildren();
  languages().forEach((l) => {
    const li = el('li');
    const b = el('button', 'lang-opt');
    b.type = 'button';
    b.dataset.code = l.code;
    const names = el('span', 'lang-names');
    const native = el('span', 'lang-native', l.name || l.code);
    const la = langAttr(l.code);
    if (la) native.lang = la;
    names.append(native);
    // English subtitle only for names in a non-Latin script (Hinglish, English need none).
    const en = /^[\x20-\x7E]+$/.test(l.name || '') ? null : (EN_NAMES[l.code] || EN_NAMES[l.code.slice(0, 2)]);
    if (en) names.append(el('span', 'lang-en', en));
    b.append(names, icon('check'));
    b.addEventListener('click', async () => { closeSheet($('#langSheet')); await setLanguage(l.code, true); });
    li.append(b);
    ul.append(li);
  });
  syncLangList();
}
function syncLangList() {
  $$('.lang-opt').forEach((b) => {
    if (b.dataset.code === state.lang) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}
async function setLanguage(code, save) {
  const ls = languages();
  const L = ls.find((l) => l.code === code) || ls.find((l) => l.code === 'en-IN') || ls[0];
  let ui = uiFor(L);
  let dict = state.en;
  if (ui !== 'en') {
    dict = await loadDict(ui);
    if (!dict) { dict = state.en; ui = 'en'; }
  }
  state.lang = L.code;
  state.ui = ui;
  state.dict = dict;
  try { state.pr = new Intl.PluralRules(ui); } catch { state.pr = PR_EN; }
  document.documentElement.lang = ui;
  loadScriptFont(L.code);
  if (save) store.set('jd.lang', L.code);
  applyI18n();
  $('#langName').textContent = L.name || L.code;
  const la = langAttr(L.code);
  if (la) $('#langName').lang = la; else $('#langName').removeAttribute('lang');
  $('#langBtn').setAttribute('aria-label', t('lang_button', { name: L.name || L.code }));
  syncLangList();
  refreshDynamic();
}
function refreshDynamic() {
  renderLoc();
  if (!state.busy && !rec.mr) setSpeak('idle');
  syncSpeed();
  syncPlayBtn();
  updateAcct();
  $$('.otp-box').forEach((b, i) => b.setAttribute('aria-label', t('otp_digit', { i: i + 1 })));
  if (state.last) render(state.last, false);
  if (!$('#codeStep').hidden) $('#codeSentTo').textContent = t('code_sent', { phone: fmtPhone(state.phone) });
  if (state.donor) renderDonorStatus(state.donor);
  if (!$('#panel-requests').hidden) loadRequests();
  updateResend();
}
function guessLang() {
  const ls = languages();
  for (const n of navigator.languages || [navigator.language || '']) {
    const p = String(n).toLowerCase().slice(0, 2);
    if (p === 'en') break;
    const hit = ls.find((l) => l.code.toLowerCase().startsWith(p));
    if (hit) return hit.code;
  }
  return (ls.find((l) => l.code === 'en-IN') || ls.find((l) => uiFor(l) === 'en') || ls[0]).code;
}
$('#langBtn').addEventListener('click', () => {
  openSheet($('#langSheet'));
  const cur = $('.lang-opt[aria-current="true"]');
  if (cur) cur.focus();
});

// ---------- sign in (OTP) ----------
let authPending = null;
let resendLeft = 0;
let resendTimer = 0;
const otpBoxes = $$('.otp-box');
const fmtPhone = (p) => (p && p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : `+91 ${p || ''}`);

function showAuthStep(step) {
  $('#phoneStep').hidden = step !== 'phone';
  $('#codeStep').hidden = step !== 'code';
  $('#acctStep').hidden = step !== 'acct';
  $('#authTitle').textContent = step === 'acct' ? t('account_title') : t('signin_title');
}
function openAuth(after) {
  authPending = typeof after === 'function' ? after : null;
  if (state.me.authenticated && !authPending) {
    $('#acctPhone').textContent = state.me.phone_masked || '';
    showAuthStep('acct');
  } else {
    setFieldError($('#phoneErr'), '');
    showAuthStep('phone');
  }
  openSheet($('#authSheet'));
  if (!$('#phoneStep').hidden) setTimeout(() => $('#phone').focus(), 50);
}
$('#authSheet').addEventListener('close', () => { authPending = null; });
$('#acctBtn').addEventListener('click', () => openAuth(null));
$('#phone').addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '').slice(0, 10);
  if (v !== e.target.value) e.target.value = v;
  setFieldError($('#phoneErr'), '');
});
$('#phoneStep').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = $('#phone').value.replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(phone)) {
    setFieldError($('#phoneErr'), t('err_phone'));
    $('#phone').focus();
    return;
  }
  const btn = $('#sendOtpBtn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await api('/api/auth/otp/send', { method: 'POST', json: { phone } });
    state.phone = phone;
    goToCode();
  } catch (err) {
    setFieldError($('#phoneErr'), errorText(err));
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
});
function goToCode() {
  showAuthStep('code');
  $('#codeSentTo').textContent = t('code_sent', { phone: fmtPhone(state.phone) });
  $('#demoNote').hidden = !state.config.demo_mode;
  setFieldError($('#codeErr'), '');
  $('.otp').classList.remove('is-invalid');
  otpBoxes.forEach((b) => { b.value = ''; });
  startResend();
  setTimeout(() => otpBoxes[0].focus(), 50);
}
function startResend() {
  resendLeft = 30;
  clearInterval(resendTimer);
  updateResend();
  resendTimer = setInterval(() => {
    resendLeft -= 1;
    if (resendLeft <= 0) { resendLeft = 0; clearInterval(resendTimer); }
    updateResend();
  }, 1000);
}
function updateResend() {
  const b = $('#resendBtn');
  b.disabled = resendLeft > 0;
  b.textContent = resendLeft > 0 ? t('resend_in', { time: clock(resendLeft) }) : t('resend');
}
$('#resendBtn').addEventListener('click', async () => {
  if (resendLeft > 0) return;
  try {
    await api('/api/auth/otp/send', { method: 'POST', json: { phone: state.phone } });
    startResend();
    toast(t('code_resent'));
  } catch (err) {
    setFieldError($('#codeErr'), errorText(err));
  }
});
$('#changePhone').addEventListener('click', () => {
  clearInterval(resendTimer);
  resendLeft = 0;
  showAuthStep('phone');
  $('#phone').focus();
});
function fillOtp(digits, from) {
  let i = from;
  for (const ch of digits) {
    if (i >= otpBoxes.length) break;
    otpBoxes[i].value = ch;
    i += 1;
  }
  otpBoxes[Math.min(i, otpBoxes.length - 1)].focus();
  if (otpBoxes.every((b) => b.value)) submitCode();
}
function submitCode() {
  const f = $('#codeStep');
  if (typeof f.requestSubmit === 'function') f.requestSubmit();
  else f.dispatchEvent(new Event('submit', { cancelable: true }));
}
otpBoxes.forEach((box, i) => {
  box.addEventListener('input', () => {
    const d = box.value.replace(/\D/g, '');
    setFieldError($('#codeErr'), '');
    $('.otp').classList.remove('is-invalid');
    if (d.length > 1) { box.value = ''; fillOtp(d, i); return; }
    box.value = d;
    if (d && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
    if (otpBoxes.every((b) => b.value)) submitCode();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && i > 0) { otpBoxes[i - 1].value = ''; otpBoxes[i - 1].focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && i > 0) { otpBoxes[i - 1].focus(); e.preventDefault(); }
    if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) { otpBoxes[i + 1].focus(); e.preventDefault(); }
  });
  box.addEventListener('paste', (e) => {
    const d = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!d) return;
    e.preventDefault();
    fillOtp(d.slice(0, 6), d.length >= 6 ? 0 : i);
  });
  box.addEventListener('focus', () => box.select());
});
let verifying = false;
$('#codeStep').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (verifying) return;
  const code = otpBoxes.map((b) => b.value).join('');
  if (!/^\d{6}$/.test(code)) {
    setFieldError($('#codeErr'), t('err_code_len'));
    otpBoxes.find((b) => !b.value)?.focus();
    return;
  }
  verifying = true;
  const btn = $('#verifyBtn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    const r = await api('/api/auth/otp/verify', { method: 'POST', json: { phone: state.phone, code } });
    if (r && r.ok === false) throw new ApiError(400, typeof r.detail === 'string' ? r.detail : null);
    await refreshMe(true);
    clearInterval(resendTimer);
    resendLeft = 0;
    const next = authPending;
    authPending = null;
    closeSheet($('#authSheet'));
    toast(t('signed_in'));
    if (next) next();
    else if (!$('#panel-donate').hidden) loadDonor();
  } catch (err) {
    let msg = errorText(err);
    if (err.status === 429) msg = t('err_code_many');
    else if (err.status === 400 || err.status === 401 || err.status === 422) msg = err.detail || t('err_code');
    setFieldError($('#codeErr'), msg);
    $('.otp').classList.add('is-invalid');
    otpBoxes.forEach((b) => { b.value = ''; });
    otpBoxes[0].focus();
  } finally {
    verifying = false;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
});
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* clear locally anyway */ }
  state.me = { authenticated: false, phone_masked: null, is_donor: false };
  state.donor = null;
  updateAcct();
  closeSheet($('#authSheet'));
  toast(t('signed_out'));
  if (!$('#panel-donate').hidden) loadDonor();
  if (!$('#panel-requests').hidden) loadRequests();
});
async function refreshMe(assumeAuth) {
  try {
    const me = await api('/api/me', { timeout: 8000 });
    if (me && typeof me === 'object') state.me = me;
  } catch {
    if (assumeAuth) state.me = { ...state.me, authenticated: true };
  }
  updateAcct();
}
function updateAcct() {
  const b = $('#acctBtn');
  const on = !!state.me.authenticated;
  b.classList.toggle('is-auth', on);
  b.setAttribute('aria-label', on ? t('account_label', { phone: state.me.phone_masked || '' }) : t('sign_in'));
}

// ---------- donate ----------
function showDonor(view) {
  $('#donateIntro').hidden = view !== 'intro';
  $('#donorForm').hidden = view !== 'form';
  $('#donorStatus').hidden = view !== 'status';
}
async function loadDonor() {
  clearAlert($('#donateAlert'));
  if (!state.me.authenticated) { showDonor(state.donorFormOpen ? 'form' : 'intro'); return; }
  try {
    const d = await api('/api/donors/me');
    if (d && typeof d === 'object') renderDonorStatus(d);
    else showDonor(state.donorFormOpen ? 'form' : 'intro');
  } catch (err) {
    if (err.status === 401) { state.me.authenticated = false; updateAcct(); }
    showDonor(state.donorFormOpen ? 'form' : 'intro');
    if (err.status !== 404 && err.status !== 401) {
      showAlert($('#donateAlert'), 'error', errorText(err), { label: t('retry'), fn: loadDonor });
    }
  }
}
$('#donateStart').addEventListener('click', () => {
  state.donorFormOpen = true;
  showDonor('form');
  if (!donorLoc.useGps && state.loc && !donorLoc.input.value) { donorLoc.useGps = true; renderLoc(); }
  $('#donorForm .title').setAttribute('tabindex', '-1');
  $('#donorForm .title').focus();
});
function buildDonorLangs() {
  const box = $('#donorLangs');
  const checked = new Set($$('input', box).filter((i) => i.checked).map((i) => i.value));
  box.replaceChildren();
  languages().forEach((l) => {
    const lab = el('label', 'opt');
    const inp = el('input');
    inp.type = 'checkbox';
    inp.name = 'dlang';
    inp.value = l.code;
    inp.checked = checked.size ? checked.has(l.code) : l.code === state.lang;
    const span = el('span', null, l.name || l.code);
    const la = langAttr(l.code);
    if (la) span.lang = la;
    lab.append(inp, span);
    box.append(lab);
  });
}
$('#lastDonation').max = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('#donorGroups').addEventListener('change', () => { setFieldError($('#errGroup'), ''); });
$('#dPlace').addEventListener('input', () => { setFieldError($('#errPlace'), ''); });
$('#dfChecks').addEventListener('change', () => { setFieldError($('#errChecks'), ''); });
$('#donorForm').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAlert($('#donateAlert'));
  const group = $('input[name="dgroup"]:checked')?.value || null;
  const loc = locPayload(donorLoc);
  const ageOk = $('#ageOk').checked;
  const weightOk = $('#weightOk').checked;
  const consent = $('#consentOk').checked;
  let first = null;
  setFieldError($('#errGroup'), group ? '' : t('err_donor_group'));
  if (!group) first = first || $('input[name="dgroup"]');
  const hasLoc = loc.lat != null || !!loc.place;
  setFieldError($('#errPlace'), hasLoc ? '' : t('err_donor_place'));
  if (!hasLoc) first = first || $('#dPlace');
  const checksOk = ageOk && weightOk && consent;
  setFieldError($('#errChecks'), checksOk ? '' : t('err_donor_checks'));
  if (!checksOk) first = first || [$('#ageOk'), $('#weightOk'), $('#consentOk')].find((c) => !c.checked);
  if (first) { first.focus(); return; }
  const sex = $('input[name="dsex"]:checked')?.value || null;
  const body = {
    blood_group: group,
    lat: loc.lat,
    lng: loc.lng,
    place: loc.place,
    languages: $$('input[name="dlang"]:checked').map((i) => i.value),
    last_donation: $('#lastDonation').value || null,
    sex: sex || null,
    age_ok: ageOk,
    weight_ok: weightOk,
    consent,
  };
  const submit = async () => {
    const btn = $('#donorSubmit');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      const d = await api('/api/donors', { method: 'POST', json: body });
      state.donorFormOpen = false;
      state.me.is_donor = true;
      renderDonorStatus(d || {});
      toast(t('donor_saved'));
      $('#donorStatus .title').setAttribute('tabindex', '-1');
      $('#donorStatus .title').focus();
    } catch (err) {
      if (err.status === 401) { openAuth(submit); return; }
      showAlert($('#donateAlert'), 'error', errorText(err));
      $('#donateAlert').scrollIntoView({ block: 'nearest' });
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  };
  if (!state.me.authenticated) openAuth(submit);
  else submit();
});
function renderDonorStatus(d) {
  state.donor = d;
  showDonor('status');
  $('#dsGroup').textContent = fmtGroup(d.blood_group) || '';
  $('#dsGroup').hidden = !d.blood_group;
  const sw = $('#availSwitch');
  sw.checked = !!d.available;
  const line = $('#dsState');
  let cls = 'is-ok';
  let ic = 'check';
  let text;
  if (d.status === 'resting') {
    cls = 'is-rest'; ic = 'schedule';
    text = d.eligible_from ? t('donor_resting', { date: fmtDate(d.eligible_from) }) : t('donor_resting_plain');
  } else if (d.available) {
    text = t('donor_available');
  } else {
    cls = 'is-off'; ic = 'error';
    text = t('donor_paused');
  }
  line.className = `status-line ${cls}`;
  line.replaceChildren(icon(ic), el('span', null, text));
}
$('#availSwitch').addEventListener('change', async (e) => {
  const sw = e.target;
  const want = sw.checked;
  sw.disabled = true;
  const send = async () => {
    try {
      const d = await api('/api/donors/me', { method: 'PATCH', json: { available: want } });
      renderDonorStatus(d && typeof d === 'object' && 'available' in d ? d : { ...state.donor, available: want });
      announce(want ? t('donor_available') : t('donor_paused'));
    } catch (err) {
      sw.checked = !want;
      if (err.status === 401) { openAuth(send); return; }
      showAlert($('#donateAlert'), 'error', errorText(err));
    } finally {
      sw.disabled = false;
    }
  };
  send();
});

// ---------- my requests ----------
const STATUS_KEYS = {
  searching: 'status_searching', results: 'status_results', results_ready: 'status_results',
  donor_agreed: 'status_donor', closed: 'status_closed', clarify: 'status_clarify', no_results: 'status_none',
  donors_asked: 'status_asked',
};
let reqLoading = false;
async function loadRequests() {
  if (reqLoading) return;
  reqLoading = true;
  const list = $('#reqList');
  const alertBox = $('#reqAlert');
  clearAlert(alertBox);
  $('#reqEmpty').hidden = true;
  list.setAttribute('aria-busy', 'true');
  try {
    const d = await api('/api/requests');
    const items = Array.isArray(d?.requests) ? d.requests.filter((r) => r && typeof r === 'object') : [];
    list.replaceChildren(...items.map(reqItem));
    $('#reqEmpty').hidden = items.length > 0;
  } catch (err) {
    list.replaceChildren();
    if (err.status === 401) {
      showAlert(alertBox, 'warn', t('requests_signin'), { label: t('sign_in'), fn: () => openAuth(loadRequests) });
    } else {
      showAlert(alertBox, 'error', errorText(err), { label: t('retry'), fn: loadRequests });
    }
  } finally {
    list.removeAttribute('aria-busy');
    reqLoading = false;
  }
}
function reqItem(r) {
  const li = el('li', 'card req');
  const top = el('div', 'req-top');
  if (isGroup(r.blood_group)) top.append(el('span', 'group-chip', fmtGroup(r.blood_group)));
  if (finite(r.units)) top.append(el('span', 'bank-units', t('units_n', { n: r.units })));
  const sk = STATUS_KEYS[r.status];
  const pill = el('span', 'status-pill', sk ? t(sk) : String(r.status || '').replace(/_/g, ' '));
  if (r.status === 'results' || r.status === 'results_ready' || r.status === 'donor_agreed') pill.classList.add('is-ok');
  if (pill.textContent) top.append(pill);
  li.append(top);
  if (r.place) li.append(el('p', 'req-place', r.place));
  li.append(el('p', 'caption', finite(r.found_within_km) ? t('req_found', { km: r.found_within_km }) : t('req_not_found')));
  const meta = [];
  if (r.request_id) meta.push(t('req_id', { id: r.request_id }));
  const when = r.created_at ? fmtWhen(r.created_at) : null;
  if (when) meta.push(when);
  if (meta.length) li.append(el('p', 'caption num', meta.join(' · ')));
  const again = el('button', 'btn btn-secondary', t('search_again'));
  again.type = 'button';
  again.addEventListener('click', () => {
    if (isGroup(r.blood_group)) groupSel.value = r.blood_group;
    if (finite(r.units)) setUnits(r.units);
    if (r.place) { placeIn.value = r.place; searchLoc.useGps = false; } else if (state.loc) searchLoc.useGps = true;
    renderLoc();
    state.pendingClarify = false;
    selectTab('find');
    doSearch({ request_id: null });
  });
  li.append(again);
  return li;
}
$('#reqFind').addEventListener('click', () => { selectTab('find'); groupSel.focus(); });

// ---------- boot ----------
async function boot() {
  const [en, cfg, me] = await Promise.all([
    loadDict('en'),
    api('/api/config', { timeout: 8000 }).catch(() => null),
    api('/api/me', { timeout: 8000 }).catch(() => null),
  ]);
  state.en = en || {};
  state.dict = state.en;
  if (cfg && typeof cfg === 'object') {
    state.config = {
      ...FALLBACK_CONFIG,
      ...cfg,
      languages: Array.isArray(cfg.languages) && cfg.languages.length ? cfg.languages : FALLBACK_CONFIG.languages,
    };
  }
  if (me && typeof me === 'object') state.me = me;
  setEmergency(state.config.emergency);
  buildLangList();
  const saved = store.get('jd.lang');
  const initial = saved && languages().some((l) => l.code === saved) ? saved : guessLang();
  await setLanguage(initial, false);
  buildDonorLangs();
  // The voice bot at "/" is the main screen; this page serves Donate and My requests.
  selectTab(location.hash === '#requests' ? 'requests' : 'donate');
  initGeo();
}
boot();
