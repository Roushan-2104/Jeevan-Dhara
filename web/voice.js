// Jeevan Dhara voice bot: tap once, speak, it stops when you stop, answers by voice.
// Language is detected from speech; location comes from GPS or the place you name.
// All server/user text is set with textContent (no innerHTML).

const $ = (s, r = document) => r.querySelector(s);
const MAX_MS = 30000;       // Gnani STT limit per clip
const NO_SPEECH_MS = 7000;  // give up if nothing is said
const SILENCE_MS = 1300;    // end of turn after this much quiet
const MAX_AUTO_TURNS = 3;   // hands-free follow-ups in a row

const STR = {
  en: {
    idle: 'Tap and speak', listening: 'Listening… tap to send', thinking: 'Finding blood near you…',
    speaking: 'Speaking… tap to interrupt', no_speech: "I didn't hear anything. Tap and speak again.",
    mic_denied: 'Microphone is blocked. Allow it in the browser, or type instead.', no_mic: 'Voice is not supported in this browser. Please type instead.',
    you: 'You', bot: 'Jeevan Dhara', replay: 'Play', call: 'Call', directions: 'Directions', units: (n) => `${n} unit${n === 1 ? '' : 's'}`,
    updated: (t) => `Updated ${t}`, stale: 'Updated over a day ago · call first', today: 'today', compat: 'Compatible group · doctor must confirm',
    ring_none: (a) => `None within ${a} km`, ring_found: (n, r) => `${n} within ${r} km`, approx: 'near the place you said', gps: 'near your location',
    donors: (n, r) => `${n} willing donor${n === 1 ? '' : 's'} within ${r} km`, ask_donors: 'Ask nearby donors', wider: 'Search up to 50 km',
    become_donor: 'Become a donor', new: 'New', donate: 'Donate', requests: 'My requests', type_instead: 'Type instead',
    type_label: 'Type your request', demo: 'Demo data', emergency: 'Emergency', helpline: 'Helpline', network: 'No connection. Please try again.',
    voice_off: 'Voice is not available right now. Please type your request.', voice_note: '(voice message)',
    map_label: 'Map of the search area and blood banks',
    call_nearest: 'Call nearest blood bank', call_nearest_sub: (name, km) => `${name} · ${km} km`,
  },
  hi: {
    idle: 'दबाइए और बोलिए', listening: 'सुन रहे हैं… भेजने के लिए दबाइए', thinking: 'आपके पास खून खोज रहे हैं…',
    speaking: 'बोल रहे हैं… रोकने के लिए दबाइए', no_speech: 'कुछ सुनाई नहीं दिया। फिर से दबाकर बोलिए।',
    mic_denied: 'माइक्रोफ़ोन बंद है। ब्राउज़र में अनुमति दें, या लिखकर भेजें।', no_mic: 'इस ब्राउज़र में आवाज़ नहीं चलती। कृपया लिखकर भेजें।',
    you: 'आप', bot: 'जीवन धारा', replay: 'सुनें', call: 'फ़ोन करें', directions: 'रास्ता', units: (n) => `${n} यूनिट`,
    updated: (t) => `अपडेट: ${t}`, stale: 'एक दिन से पुरानी जानकारी · पहले फ़ोन करें', today: 'आज', compat: 'मिलता-जुलता ग्रुप · डॉक्टर से पक्का करें',
    ring_none: (a) => `${a} किमी में कोई नहीं`, ring_found: (n, r) => `${r} किमी में ${n}`, approx: 'आपकी बताई जगह के पास', gps: 'आपकी लोकेशन के पास',
    donors: (n, r) => `${r} किमी में ${n} डोनर मदद को तैयार`, ask_donors: 'पास के डोनर से पूछें', wider: '50 किमी तक खोजें',
    become_donor: 'डोनर बनें', new: 'नया', donate: 'रक्तदान', requests: 'मेरे अनुरोध', type_instead: 'लिखकर भेजें',
    type_label: 'अपना अनुरोध लिखें', demo: 'डेमो डेटा', emergency: 'इमरजेंसी', helpline: 'हेल्पलाइन', network: 'इंटरनेट नहीं है। फिर कोशिश करें।',
    voice_off: 'अभी आवाज़ उपलब्ध नहीं है। कृपया लिखकर भेजें।', voice_note: '(आवाज़ संदेश)',
    map_label: 'खोज का इलाका और ब्लड बैंक का नक्शा',
    call_nearest: 'सबसे पास वाले ब्लड बैंक को फ़ोन करें', call_nearest_sub: (name, km) => `${name} · ${km} किमी`,
  },
};
const HI_UI = new Set(['hi-IN', 'mr-IN']);

const state = { ui: 'en', requestId: null, autoTurns: 0, coords: null, geoAsked: false, busy: false };
const talk = $('#talk');
const statusEl = $('#status');
const thread = $('#thread');
const player = $('#player');
const s = (k, ...a) => { const v = STR[state.ui][k] ?? STR.en[k]; return typeof v === 'function' ? v(...a) : v; };

// ---------- UI language follows the language the person speaks ----------
function setUi(lang) {
  const ui = HI_UI.has(lang) ? 'hi' : 'en';
  if (ui === state.ui) return;
  state.ui = ui;
  document.documentElement.lang = ui === 'hi' ? 'hi' : 'en';
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = s(n.dataset.t); });
  document.querySelectorAll('[data-t-aria]').forEach((n) => n.setAttribute('aria-label', s(n.dataset.tAria)));
  try { localStorage.setItem('jd.lang', ui === 'hi' ? 'hi-IN' : 'en-IN'); } catch { /* private mode */ }
}

function setState(mode, text) {
  talk.dataset.state = mode;
  talk.setAttribute('aria-label', s(mode === 'idle' ? 'idle' : mode));
  statusEl.textContent = text ?? s(mode);
  const icon = $('use', talk);
  icon.setAttribute('href', mode === 'listening' || mode === 'speaking' ? '#i-stop' : '#i-mic');
  talk.disabled = mode === 'thinking';
}

// ---------- API ----------
async function api(path, { json, form } = {}) {
  const opts = { method: json || form ? 'POST' : 'GET', credentials: 'same-origin', headers: {} };
  if (json) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
  if (form) opts.body = form;
  let res;
  try { res = await fetch(path, opts); } catch { throw new Error(s('network')); }
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error((body && typeof body.detail === 'string' && body.detail) || s('network'));
    err.status = res.status;
    throw err;
  }
  return body;
}

// ---------- location: ask once, quietly reuse ----------
function locate() {
  if (state.geoAsked || !navigator.geolocation) return;
  state.geoAsked = true;
  navigator.geolocation.getCurrentPosition(
    (p) => { state.coords = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }; },
    () => { state.coords = null; },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
  );
}
async function preloadGeo() {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' });
    if (p && p.state === 'granted') locate();
  } catch { /* Permissions API not available */ }
}

// ---------- recording with automatic end-of-speech ----------
const rec = { mr: null, stream: null, ctx: null, timer: null, chunks: [], discard: false };
const MIME = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find(
  (m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? null;

async function listen() {
  if (!MIME || !navigator.mediaDevices?.getUserMedia) { showTyping(true); setState('idle', s('no_mic')); return; }
  stopReply();
  locate();
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    setState('idle', s('mic_denied'));
    showTyping(true);
    return;
  }
  rec.chunks = [];
  rec.discard = false;
  rec.mr = new MediaRecorder(rec.stream, { mimeType: MIME, audioBitsPerSecond: 24000 });
  rec.mr.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = onRecorded;
  rec.mr.start(250);
  setState('listening');
  if (navigator.vibrate && navigator.userActivation?.isActive) navigator.vibrate(20);
  watchSilence();
}

function watchSilence() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  rec.ctx = new Ctx();
  const an = rec.ctx.createAnalyser();
  an.fftSize = 1024;
  rec.ctx.createMediaStreamSource(rec.stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  let floor = 0.01; let calib = 0; let n = 0; let spoke = false; let lastVoice = t0;
  rec.timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (now - t0 < 300) { calib += rms; n += 1; floor = Math.max(0.006, calib / n); return; }
    const threshold = Math.max(0.02, floor * 3);
    document.documentElement.style.setProperty('--lvl', Math.min(1, rms / (threshold * 4)).toFixed(2));
    if (rms > threshold) { spoke = true; lastVoice = now; }
    if (spoke && now - lastVoice > SILENCE_MS) stopListening(true);
    else if (!spoke && now - t0 > NO_SPEECH_MS) { rec.discard = true; stopListening(false); }
    else if (now - t0 > MAX_MS) stopListening(true);
  }, 60);
}

function stopListening(send) {
  clearInterval(rec.timer);
  rec.timer = null;
  document.documentElement.style.setProperty('--lvl', '0');
  if (!send) rec.discard = true;
  try { rec.ctx?.close(); } catch { /* closed */ }
  rec.ctx = null;
  if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop();
}

function onRecorded() {
  rec.stream?.getTracks().forEach((t) => t.stop());
  rec.stream = null;
  const blob = new Blob(rec.chunks, { type: MIME });
  rec.mr = null;
  if (rec.discard || blob.size < 1500) { setState('idle', s('no_speech')); return; }
  const fd = new FormData();
  fd.append('audio', blob, MIME.includes('mp4') ? 'voice.m4a' : 'voice.webm');
  if (state.requestId) fd.append('request_id', state.requestId);
  if (state.coords) { fd.append('lat', state.coords.lat); fd.append('lng', state.coords.lng); fd.append('accuracy', state.coords.accuracy); }
  converse(() => api('/api/ask', { form: fd }), null);
}

// ---------- conversation ----------
async function converse(call, typedText) {
  $('#intro').hidden = true;
  $('#newChat').hidden = false;
  const userMsg = addUser(typedText);
  const wait = addTyping();
  setState('thinking');
  state.busy = true;
  try {
    const resp = await call();
    wait.remove();
    state.requestId = resp.request_id || state.requestId;
    const heard = resp.heard || {};
    if (heard.language) setUi(heard.language);
    if (!typedText) setUserText(userMsg, heard.transcript || s('voice_note'), heard.language);
    renderBot(resp);
    speak(resp);
  } catch (e) {
    wait.remove();
    addBotError(e.status === 503 ? s('voice_off') : e.message);
    if (e.status === 503) showTyping(true);
    setState('idle');
  } finally {
    state.busy = false;
  }
}

function addUser(text) {
  const li = el('li', 'msg msg-user');
  const b = el('div', 'bubble', text || '…');
  li.append(b);
  thread.append(li);
  scrollDown();
  return b;
}
function setUserText(b, text, lang) { b.textContent = text; if (lang) b.lang = lang; }
function addTyping() {
  const li = el('li', 'msg msg-bot');
  const b = el('div', 'bubble typing');
  b.append(el('i'), el('i'), el('i'));
  b.setAttribute('aria-label', s('thinking'));
  li.append(b);
  thread.append(li);
  scrollDown();
  return li;
}
function addBotError(text) {
  const li = el('li', 'msg msg-bot');
  li.append(el('div', 'bubble err', text));
  thread.append(li);
  scrollDown();
}

function renderBot(resp) {
  const li = el('li', 'msg msg-bot');
  const b = el('div', 'bubble');
  const head = el('div', 'bubble-head');
  head.append(svg('i-drop'), el('span', '', s('bot')));
  const reply = resp.reply || {};
  if (safeAudio(reply.audio_url)) {
    const rp = el('button', 'replay');
    rp.type = 'button';
    rp.append(svg('i-volume'), el('span', '', s('replay')));
    rp.addEventListener('click', () => playUrl(reply.audio_url, null));
    head.append(rp);
  }
  const p = el('p', '', reply.text || '');
  if (reply.language) p.lang = reply.language;
  b.append(head, p);
  li.append(b);

  if (resp.status === 'results' || resp.status === 'no_results') li.append(renderResults(resp));
  if (resp.status === 'donate') {
    const a = el('a', 'btn btn-red', null);
    a.href = 'app.html#donate';
    a.append(svg('i-heart'), el('span', '', s('become_donor')));
    const box = el('div', 'results more-acts');
    box.append(a);
    li.append(box);
  }
  thread.append(li);
  if (resp.status === 'results' || resp.status === 'no_results') {
    // Show the answer from its start (reply, then the map as its rings grow), not the bottom of the list.
    requestAnimationFrame(() => li.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'auto' : 'smooth' }));
  } else {
    scrollDown();
  }
}

function renderResults(resp) {
  const box = el('div', 'results');
  const sr = resp.search || {};
  const results = Array.isArray(resp.results) ? resp.results : [];
  const searched = Array.isArray(sr.searched_km) ? sr.searched_km : [];
  const ring = el('p', 'ring');
  ring.append(svg('i-place', 'icon i-sm'));
  const parts = [];
  if (results.length && sr.empty_within_km) parts.push(s('ring_none', sr.empty_within_km));
  if (results.length) parts.push(s('ring_found', results.length, sr.found_within_km));
  else if (searched.length) parts.push(s('ring_none', searched[searched.length - 1]));
  const strong = el('b', '', parts.join(' · '));
  ring.append(strong, el('span', '', `· ${sr.approximate ? s('approx') : s('gps')}`));
  box.append(ring);
  // The one thing a frightened person needs next: a single big tap that rings the nearest bank.
  if (results.length) box.append(callNearest(results[0]));

  let pins = null;
  if (sr.center) {
    const mapEl = el('div', 'map');
    mapEl.setAttribute('role', 'region');
    mapEl.setAttribute('aria-label', s('map_label'));
    box.append(mapEl);
    pins = new Map();
    setTimeout(() => drawMap(mapEl, resp, pins), 0); // after the element is in the page
  }
  if (results.length) {
    const ol = el('ol', 'banks');
    results.forEach((r) => {
      const card = bankCard(r);
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        ol.querySelectorAll('.bank.is-active').forEach((n) => n.classList.remove('is-active'));
        card.classList.add('is-active');
        pins?.forEach((m, k) => m.getElement()?.classList.toggle('is-active', k === String(r.rank)));
        const m = pins?.get(String(r.rank));
        if (m) m._map?.panTo(m.getLatLng());
      });
      ol.append(card);
    });
    box.append(ol);
  }
  const acts = el('div', 'more-acts');
  const donors = resp.donors;
  if (donors && donors.count) {
    box.append(el('p', 'note', s('donors', donors.count, donors.within_km)));
    acts.append(actionBtn('i-donors', s('ask_donors'), async (btn) => {
      const out = await api(`/api/requests/${encodeURIComponent(resp.request_id)}/ask-donors`, { json: {} });
      btn.replaceWith(el('p', 'note', out.message));
    }));
  }
  if (!results.length && sr.can_extend) {
    acts.append(actionBtn('i-place', s('wider'), async () => {
      await converse(() => api(`/api/search/${encodeURIComponent(resp.request_id)}/extend`, { json: {} }), s('wider'));
    }));
  }
  if (acts.childElementCount) box.append(acts);
  return box;
}

// ---------- map (Leaflet from cdnjs, loaded on first results) ----------
const LEAFLET = {
  base: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/',
  css: 'sha384-c6Rcwz4e4CITMbu/NBmnNS8yN2sC3cUElMEMfP3vqqKFp7GOYaaBBCqmaWBjmkjb',
  js: 'sha384-NElt3Op+9NBMCYaef5HxeJmU4Xeard/Lku8ek6hoPTvYkQPh3zLIrJP7KiRocsxO',
};
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${LEAFLET.base}leaflet.min.css`, integrity: LEAFLET.css, crossOrigin: 'anonymous', referrerPolicy: 'no-referrer' });
    const js = Object.assign(document.createElement('script'), { src: `${LEAFLET.base}leaflet.min.js`, integrity: LEAFLET.js, crossOrigin: 'anonymous', referrerPolicy: 'no-referrer', async: true });
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('leaflet')));
    js.onerror = () => { leafletP = null; reject(new Error('leaflet')); };
    document.head.append(css, js);
  });
  return leafletP;
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

async function drawMap(mapEl, resp, pins) {
  let L;
  try { L = await loadLeaflet(); } catch { mapEl.remove(); return; }
  const sr = resp.search;
  const c = [sr.center.lat, sr.center.lng];
  const map = L.map(mapEl, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, subdomains: 'abc', attribution: '© OpenStreetMap contributors',
  }).addTo(map);
  const results = Array.isArray(resp.results) ? resp.results : [];
  const rings = (sr.searched_km || []).filter((k) => Number.isFinite(k) && k > 0);
  const found = sr.found_within_km;

  // Centre: you (GPS) or the place you named.
  L.circleMarker(c, sr.approximate
    ? { radius: 7, color: '#1F2933', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }
    : { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#1976D2', fillOpacity: 1 }).addTo(map);

  results.forEach((r) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return;
    const node = document.createElement('div');
    node.className = r.match === 'compatible' ? 'pin pin-compat' : 'pin';
    node.append(el('span', 'pin-n', String(r.rank)));
    const m = L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: 'pin-icon', html: node, iconSize: [30, 30], iconAnchor: [15, 36] }),
      title: `${r.rank}. ${r.name}`, keyboard: false,
    }).addTo(map);
    pins.set(String(r.rank), m);
  });

  const maxKm = rings.length ? Math.max(...rings) : 5;
  map.fitBounds(L.latLng(c).toBounds(maxKm * 2000 * 1.05), { animate: false, padding: [8, 8] });

  // The radius ladder, drawn the way it ran: each ring grows out in turn.
  const drawRing = (km, isFound) => L.circle(c, {
    radius: reducedMotion.matches ? km * 1000 : 1, color: isFound ? '#D32F2F' : '#6B7785',
    weight: isFound ? 2.5 : 1.5, dashArray: isFound ? null : '6 6', fill: isFound, fillColor: '#D32F2F',
    fillOpacity: isFound ? 0.06 : 0, interactive: false,
  }).addTo(map);
  for (const km of rings) {
    const ring = drawRing(km, km === found);
    if (reducedMotion.matches || document.hidden) { ring.setRadius(km * 1000); continue; }
    await new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 700);
        ring.setRadius(km * 1000 * (1 - (1 - p) ** 3));
        if (p < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    const lbl = L.marker([c[0], c[1] + km / (111 * Math.cos((c[0] * Math.PI) / 180))], {
      icon: L.divIcon({ className: 'ring-label', html: el('span', km === found ? 'is-found' : '', `${km} km`), iconSize: [52, 20], iconAnchor: [26, 10] }),
      interactive: false, keyboard: false,
    });
    lbl.addTo(map);
  }
}

function bankCard(r) {
  const li = $('#tpl-bank').content.firstElementChild.cloneNode(true);
  $('.rank', li).textContent = r.rank;
  $('.bank-name', li).textContent = r.name;
  $('.bank-km', li).textContent = `${Number(r.distance_km).toFixed(1)} km`;
  $('.grp', li).textContent = String(r.blood_group || '').replace('-', '−');
  $('.units', li).textContent = s('units', r.units);
  if (r.match === 'compatible') { const c = $('.compat', li); c.hidden = false; c.textContent = s('compat'); }
  const when = $('.bank-when', li);
  if (r.stale) { when.classList.add('stale'); $('span', when).textContent = s('stale'); } else { $('span', when).textContent = s('updated', fmtWhen(r.updated_at)); }
  $('.bank-meta', li).textContent = [r.type, r.hours, r.area].filter(Boolean).join(' · ');
  const call = $('.act-call', li);
  call.href = telHref(r.phone);
  $('span', call).textContent = s('call');
  const dir = $('.act-dir', li);
  dir.href = `https://www.google.com/maps/dir/?api=1&destination=${Number(r.lat)},${Number(r.lng)}`;
  $('span', dir).textContent = s('directions');
  return li;
}

function telHref(phone) { return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`; }

function callNearest(r) {
  const a = el('a', 'call-top');
  a.href = telHref(r.phone);
  const txt = el('span', 'call-top-txt');
  txt.append(el('b', '', s('call_nearest')), el('span', '', s('call_nearest_sub', r.name, Number(r.distance_km).toFixed(1))));
  const grp = el('span', 'call-top-grp', `${String(r.blood_group || '').replace('-', '−')} · ${s('units', r.units)}`);
  a.append(svg('i-call'), txt, grp);
  return a;
}

function actionBtn(iconId, label, onClick) {
  const b = el('button', 'btn btn-line');
  b.type = 'button';
  b.append(svg(iconId), el('span', '', label));
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await onClick(b); } catch (e) { addBotError(e.message); b.disabled = false; }
  });
  return b;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(state.ui === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `${s('today')} ${time}` : time;
}

// ---------- voice reply ----------
function safeAudio(u) { return typeof u === 'string' && /^\/media\/[0-9a-f]{32}\.(mp3|ogg)$/.test(u); }
function stopReply() { try { player.pause(); } catch { /* idle */ } }

function speak(resp) {
  const url = resp.reply?.audio_url;
  const followUp = resp.status === 'clarify' && state.autoTurns < MAX_AUTO_TURNS;
  if (!safeAudio(url)) { finishTurn(followUp); return; }
  playUrl(url, () => finishTurn(followUp));
}

function playUrl(url, onEnd) {
  stopReply();
  player.src = url;
  player.onended = () => { setState('idle'); if (onEnd) onEnd(); };
  player.onerror = () => { setState('idle'); if (onEnd) onEnd(); };
  setState('speaking');
  player.play().catch(() => { setState('idle'); if (onEnd) onEnd(); });
}

function finishTurn(followUp) {
  if (talk.dataset.state === 'speaking') setState('idle');
  if (followUp) { state.autoTurns += 1; setTimeout(() => { if (talk.dataset.state === 'idle') listen(); }, 350); } else {
    state.autoTurns = 0;
    if (talk.dataset.state !== 'listening') setState('idle');
  }
}

// ---------- typing fallback ----------
function showTyping(on) {
  $('#typeForm').hidden = !on;
  $('#typeBtn').setAttribute('aria-pressed', String(on));
  if (on) $('#typeIn').focus();
}
$('#typeBtn').addEventListener('click', () => showTyping($('#typeForm').hidden));
$('#typeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#typeIn').value.trim();
  if (!text || state.busy) return;
  $('#typeIn').value = '';
  locate();
  const body = { text, request_id: state.requestId };
  if (state.coords) Object.assign(body, state.coords);
  converse(() => api('/api/search', { json: body }), text);
});

// ---------- main button ----------
talk.addEventListener('click', () => {
  const mode = talk.dataset.state;
  if (mode === 'listening') { stopListening(true); return; }
  if (mode === 'thinking') return;
  state.autoTurns = 0;
  listen();
});
$('#newChat').addEventListener('click', () => {
  stopReply();
  if (rec.mr) stopListening(false);
  state.requestId = null;
  state.autoTurns = 0;
  thread.replaceChildren();
  $('#intro').hidden = false;
  $('#newChat').hidden = true;
  setState('idle');
});

// ---------- helpers ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svg(id, cls = 'icon') {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  n.setAttribute('class', cls);
  n.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#${id}`);
  n.append(u);
  return n;
}
function scrollDown() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); }

preloadGeo();
