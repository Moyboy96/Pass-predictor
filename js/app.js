// entry point. owns the compute pipeline, the share link, event wiring and
// the one-second tick. rendering lives in views / timeline / overlay.

import { els, setMessage, hasLocation } from './dom.js';
import { state, sat, HISTORY_MS } from './state.js';
import { parseTles, noradId } from './tle.js';
import { loadPrefs, savePrefs, takeLegacyPrefs } from './storage.js';
import { makeObserver, findPasses } from './passes.js';
import { setUtc, zoneName, plural } from './format.js';
import {
  renderLibrary, renderList, renderHistory, renderHero, renderAge, renderSetupSummary, resetHero, passByTag,
} from './views.js';
import { renderTimeline } from './timeline.js';
import { openOverlay, closeOverlay, drawOverlay, updateOverlayLive, overlayPass } from './overlay.js';

const DEFAULT_MIN_EL = 5;
const DEFAULT_HOURS = 48;
const MAX_HOURS = 336;               // two weeks
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TICK_MS = 1000;
const TIMELINE_REFRESH_TICKS = 30;   // redraw the timeline every 30 s so the now line moves

// ---------- preferences ----------

function persist() {
  const s = els.setup;
  savePrefs({
    lat: s.lat.value,
    lon: s.lon.value,
    alt: s.alt.value,
    minEl: s.minEl.value,
    hours: s.hours.value,
    utc: s.utc.checked,
    view: state.view,
    selId: state.library.selectedId,
  });
}

function applyPrefs(prefs) {
  const s = els.setup;
  s.lat.value = prefs.lat || '';
  s.lon.value = prefs.lon || '';
  s.alt.value = prefs.alt || '';
  if (prefs.minEl) s.minEl.value = prefs.minEl;
  if (prefs.hours) s.hours.value = prefs.hours;
  s.utc.checked = !!prefs.utc;
  state.view = prefs.view === 'timeline' ? 'timeline' : 'list';
  state.library.selectedId = prefs.selId || '';
}

// ---------- input parsing ----------

// "38.8977", "38.8977N", "77.0365 W", "38,8977" all work
function parseCoordinate(raw) {
  const text = String(raw ?? '').trim().toUpperCase().replace(/[°,]/g, ' ').replace(/\s+/g, ' ');
  if (!text) return NaN;
  const sign = /[SW]/.test(text) ? -1 : 1;
  const value = parseFloat(text.replace(/[NSEW]/g, '').trim());
  return Number.isNaN(value) ? NaN : value * sign;
}

function readSettings() {
  const s = els.setup;
  let minEl = parseFloat(s.minEl.value);
  if (Number.isNaN(minEl)) minEl = DEFAULT_MIN_EL;

  let hours = parseFloat(s.hours.value);
  if (Number.isNaN(hours) || hours < 1) hours = DEFAULT_HOURS;
  if (hours > MAX_HOURS) hours = MAX_HOURS;

  // write the cleaned values back so what is shown is what was used
  s.minEl.value = minEl;
  s.hours.value = hours;
  return { minEl, hours };
}

function readLocation() {
  const s = els.setup;
  const lat = parseCoordinate(s.lat.value);
  const lon = parseCoordinate(s.lon.value);
  const alt = parseFloat(String(s.alt.value).replace(/[^\d.\-]/g, '')) || 0;
  const ok = !Number.isNaN(lat) && !Number.isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return ok ? { lat, lon, alt } : null;
}

// move whatever is in the textarea into the library. returns how many sets.
function saveTextarea() {
  const sets = parseTles(els.setup.tle.value);
  if (!sets.length) return 0;

  const lastId = state.library.add(sets);
  state.library.selectedId = sets.length === 1 ? noradId(sets[0].l1) : lastId;
  els.setup.tle.value = '';
  renderLibrary();
  return sets.length;
}

// ---------- compute ----------

function renderPasses() {
  const p = els.passes;
  if (!state.satrec) {
    p.root.innerHTML = '';
    p.viewbar.hidden = true;
    return;
  }
  p.viewbar.hidden = false;
  p.listButton.classList.toggle('on', state.view === 'list');
  p.timelineButton.classList.toggle('on', state.view === 'timeline');
  if (state.view === 'timeline') renderTimeline();
  else renderList();
}

function renderAll() {
  renderAge();
  renderSetupSummary();
  renderPasses();
  renderHistory();
  renderHero();
}

// quiet = true for automatic recomputes: no status message, panel left alone
function compute(quiet = false) {
  if (typeof satellite === 'undefined') {
    setMessage('The propagation library did not load. Reload the page.', true);
    return;
  }

  const added = saveTextarea();
  const entry = state.library.selected;
  if (!entry) {
    setMessage('Paste a TLE (line 1 and line 2, name optional) or load a file.', true);
    return;
  }
  state.library.selectedId = entry.id;
  els.library.value = entry.id;

  const where = readLocation();
  if (!where) {
    setMessage('Enter a latitude between −90 and 90 and a longitude between −180 and 180.', true);
    els.setup.panel.open = true;
    return;
  }
  const { minEl, hours } = readSettings();

  let satrec = null;
  try {
    satrec = satellite.twoline2satrec(entry.l1, entry.l2);
  } catch {
    satrec = null;
  }
  if (!satrec || satrec.error) {
    setMessage(`The TLE for ${entry.name} could not be parsed.`, true);
    return;
  }

  state.satrec = satrec;
  state.satName = entry.name;
  state.observer = makeObserver(where.lat, where.lon, where.alt);
  state.minEl = minEl;
  state.hours = hours;

  const now = Date.now();
  let passes = [];
  try {
    passes = findPasses(satrec, state.observer, now - HISTORY_MS, now + hours * 3600e3, minEl);
  } catch {
    setMessage('Propagation failed for this TLE. It may have decayed or the elements may be corrupt.', true);
  }
  state.past = passes.filter(p => p.los <= now);
  state.upcoming = passes.filter(p => p.los > now);
  state.computedAt = now;
  state.timelineScrolled = false;

  if (!quiet) {
    const saved = added ? `Saved ${added} to library. ` : '';
    setMessage(`${saved}${plural(state.upcoming.length, 'pass')} ahead for ${entry.name}. Times in ${zoneName()}.`);
  }
  persist();
  renderAll();
  if (state.upcoming.length && !quiet) els.setup.panel.open = false;
}

function computeIfLocated(quiet = true) {
  if (hasLocation()) compute(quiet);
}

function clearSatellite() {
  state.satrec = null;
  state.upcoming = [];
  state.past = [];
  resetHero();
  renderAll();
}

// ---------- share link and url import ----------

// the tle and location go in the fragment, so nothing is sent to the server
function buildShareLink() {
  const s = els.setup;
  let entry = state.library.get(state.library.selectedId);
  if (!entry) entry = parseTles(s.tle.value)[0] || null;
  if (!entry) return null;

  const params = [`tle=${encodeURIComponent(`${entry.name}\n${entry.l1}\n${entry.l2}`)}`];
  if (hasLocation()) {
    params.push(`lat=${encodeURIComponent(s.lat.value)}`, `lon=${encodeURIComponent(s.lon.value)}`);
    if (s.alt.value !== '') params.push(`alt=${encodeURIComponent(s.alt.value)}`);
  }
  params.push(`minel=${encodeURIComponent(s.minEl.value)}`);

  const base = location.href.split('#')[0].split('?')[0];
  return `${base}#${params.join('&')}`;
}

function parseFragment(fragment) {
  const params = {};
  for (const pair of fragment.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    } catch {
      // malformed escape; skip this one
    }
  }
  return params;
}

// returns true if the page was opened from a share link
function importFromUrl() {
  const fragment = location.hash.replace(/^#/, '') || location.search.replace(/^\?/, '');
  if (!fragment.includes('tle=')) return false;

  const params = parseFragment(fragment);
  const sets = parseTles((params.tle || '').replace(/\r/g, ''));
  if (!sets.length) {
    setMessage('The link contained no readable TLE.', true);
    return false;
  }

  state.library.selectedId = state.library.add(sets);
  renderLibrary();

  const s = els.setup;
  if (params.lat != null) s.lat.value = params.lat;
  if (params.lon != null) s.lon.value = params.lon;
  if (params.alt != null) s.alt.value = params.alt;
  if (params.minel != null) s.minEl.value = params.minel;

  try { history.replaceState(null, '', location.pathname); } catch { /* fine */ }
  persist();

  if (hasLocation()) {
    compute();
  } else {
    setMessage('TLE loaded from link. Enter your location and compute.');
    s.panel.open = true;
  }
  return true;
}

// ---------- event handlers ----------

function onSaveToLibrary() {
  const count = saveTextarea();
  if (!count) {
    setMessage('No valid TLE in the box. Paste line 1 and line 2 (a name line above them is optional).', true);
    return;
  }
  setMessage(`Saved ${plural(count, 'satellite')} to the library.`);
  persist();
  computeIfLocated();
}

function onRemoveFromLibrary() {
  const entry = state.library.get(state.library.selectedId);
  if (!entry) {
    setMessage('Nothing selected to remove.', true);
    return;
  }
  if (!confirm(`Remove ${entry.name} from the library?`)) return;

  state.library.remove(entry.id);
  renderLibrary();
  persist();

  if (!state.library.isEmpty && hasLocation()) compute(true);
  else clearSatellite();
  setMessage(`Removed ${entry.name}.`);
}

function onFileChosen() {
  const file = els.setup.file.files && els.setup.file.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setMessage('That file is over 2 MB. Trim it to the satellites you need.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const sets = parseTles(String(reader.result || ''));
    if (!sets.length) {
      setMessage(`No TLE sets found in ${file.name}.`, true);
      return;
    }
    const lastId = state.library.add(sets);
    state.library.selectedId = sets.length === 1 ? noradId(sets[0].l1) : lastId;
    renderLibrary();
    persist();
    setMessage(`Saved ${plural(sets.length, 'satellite')} from ${file.name} to the library.`);
    computeIfLocated();
  };
  reader.onerror = () => setMessage(`Could not read ${file.name}.`, true);
  reader.readAsText(file);
}

function onShare() {
  const link = buildShareLink();
  if (!link) {
    setMessage('Save or paste a TLE first, then share.', true);
    return;
  }
  els.setup.linkOut.value = link;
  els.setup.linkWrap.hidden = false;

  const ready = () => setMessage('Link ready. Email it to yourself; opening it loads this satellite.');
  if (navigator.share) {
    navigator.share({ title: 'Pass Predictor', text: 'TLE link', url: link }).then(ready, ready);
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link)
      .then(() => setMessage('Link copied. Email it to yourself; opening it loads this satellite.'))
      .catch(ready);
  } else {
    ready();
  }
}

function onLocate() {
  const s = els.setup;
  if (!navigator.geolocation) {
    setMessage('Location is not available in this browser. Enter coordinates by hand.', true);
    return;
  }
  setMessage('Getting location…');

  const onPosition = pos => {
    s.lat.value = pos.coords.latitude.toFixed(4);
    s.lon.value = pos.coords.longitude.toFixed(4);
    if (pos.coords.altitude != null && !Number.isNaN(pos.coords.altitude)) {
      s.alt.value = Math.round(pos.coords.altitude);
    }
    setMessage(`Location set to ${s.lat.value}, ${s.lon.value}.`);
    persist();
  };
  const onError = err => {
    const why = err && err.message ? err.message : 'blocked';
    setMessage(`Location was not granted (${why}). Enter coordinates by hand.`, true);
  };

  try {
    navigator.geolocation.getCurrentPosition(onPosition, onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  } catch {
    setMessage('Location is not available here. Enter coordinates by hand.', true);
  }
}

function onUtcToggle() {
  setUtc(els.setup.utc.checked);
  els.tzLabel.textContent = zoneName();
  persist();
  renderPasses();
  renderHistory();
  renderHero();
  if (overlayPass()) drawOverlay();
}

function setView(view) {
  state.view = view;
  state.timelineScrolled = false;
  persist();
  renderPasses();
}

function bindEvents() {
  const s = els.setup;
  s.run.addEventListener('click', () => compute(false));
  s.save.addEventListener('click', onSaveToLibrary);
  s.remove.addEventListener('click', onRemoveFromLibrary);
  s.pick.addEventListener('click', () => {
    s.file.value = '';
    s.file.click();
  });
  s.file.addEventListener('change', onFileChosen);
  s.share.addEventListener('click', onShare);
  s.locate.addEventListener('click', onLocate);
  s.utc.addEventListener('change', onUtcToggle);

  els.library.addEventListener('change', () => {
    state.library.selectedId = els.library.value;
    persist();
    computeIfLocated(false);
  });

  els.passes.listButton.addEventListener('click', () => setView('list'));
  els.passes.timelineButton.addEventListener('click', () => setView('timeline'));

  // any element with data-pass (cards, timeline bars, the hero plot) opens the overlay
  document.addEventListener('click', e => {
    const target = e.target.closest ? e.target.closest('[data-pass]') : null;
    if (target && !els.overlay.root.contains(target)) openOverlay(passByTag(target.dataset.pass));
  });
  els.overlay.close.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlayPass()) closeOverlay();
  });
}

// ---------- once-a-second tick ----------

let ticks = 0;

function tick() {
  if (!state.satrec) return;
  const now = Date.now();
  ticks++;

  renderHero();
  if (overlayPass()) updateOverlayLive();

  // move passes that have ended into history, and drop history older than 24 h
  if (state.upcoming.length && state.upcoming[0].los <= now) {
    const ended = state.upcoming.filter(p => p.los <= now);
    state.past = state.past.concat(ended).filter(p => p.los > now - HISTORY_MS);
    state.upcoming = state.upcoming.filter(p => p.los > now);
    renderPasses();
    renderHistory();
  } else if (state.view === 'timeline' && ticks % TIMELINE_REFRESH_TICKS === 0) {
    renderPasses();
  }

  // recompute partway through the window so the list never runs dry
  const staleAfter = Math.min(state.hours * 3600e3 * 0.5, 6 * 3600e3);
  if (now - state.computedAt > staleAfter) compute(true);
}

// ---------- init ----------

function init() {
  state.library.load();

  let prefs = loadPrefs();
  if (!prefs) {
    // first run since the library was added: carry the v1 tle across
    const legacy = takeLegacyPrefs();
    if (legacy) {
      prefs = legacy;
      const sets = parseTles(legacy.tle || '');
      if (sets.length) prefs.selId = state.library.add(sets);
    }
  }
  if (prefs) applyPrefs(prefs);

  setUtc(els.setup.utc.checked);
  els.tzLabel.textContent = zoneName();
  renderLibrary();
  bindEvents();

  if (!importFromUrl() && !state.library.isEmpty) computeIfLocated();
  setInterval(tick, TICK_MS);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is optional */ });
  });
}

init();
registerServiceWorker();
