// Entry point. Owns application state, every event handler and the one
// timer; nothing else mutates state. Reads and writes storage, calls the
// view modules to render, and delegates all maths to propagation/polar.
// state.upcoming and state.past are pass objects (see propagation.js),
// oldest first; the library is [{ id, name, l1, l2, savedAt }].

import { els } from './dom.js';
import { readJson, writeJson, removeKey, PREFS_KEY, LIBRARY_KEY, LEGACY_PREFS_KEY } from './storage.js';
import { parseTles, parseCoordinate, parseAltitudeMetres, catalogNumber } from './tle.js';
import { findEntry, upsertSets } from './library.js';
import { TimeFormatter } from './format.js';
import { createSatrec, makeObserver, Tracker } from './propagation.js';
import { UPCOMING_TAG } from './pass-card.js';
import { renderHero, renderHeroEmpty, renderEpochAge } from './hero-view.js';
import { hidePasses, renderViewToggle, renderUpcomingList, renderTimelineView, hideHistory, renderHistory } from './passes-view.js';
import { showMessage, renderZoneLabel, renderSetupSummary, showShareLink, renderLibraryOptions } from './setup-view.js';
import { PassOverlay } from './overlay.js';
import { MS_PER_HOUR } from './units.js';

const HISTORY_WINDOW_MS = 24 * MS_PER_HOUR; // how far back the "Earlier" panel looks
const DEFAULT_MIN_ELEVATION = 5;
const DEFAULT_LOOKAHEAD_HOURS = 48;
const MAX_LOOKAHEAD_HOURS = 336; // two weeks; beyond that the search gets slow and TLEs are stale anyway
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MAX_TLE_FILE_BYTES = 2 * 1024 * 1024; // a full-catalog dump is ~1 MB; anything bigger is a mistake
const TICK_MS = 1000;
const TIMELINE_REFRESH_TICKS = 30; // redraw the now line every 30 s; it moves ~0.7 px/min
const RECOMPUTE_WINDOW_FRACTION = 0.5; // recompute once half the look-ahead has elapsed...
const RECOMPUTE_MAX_MS = 6 * MS_PER_HOUR; // ...or after six hours, whichever is sooner
const COORDINATE_DECIMALS = 4; // ~10 m, plenty for look angles
const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

const state = {
  library: [],
  selectedId: '',
  tracker: null,
  satName: '',
  upcoming: [],
  past: [],
  minElevation: DEFAULT_MIN_ELEVATION,
  hours: DEFAULT_LOOKAHEAD_HOURS,
  computedAt: 0,
  view: 'list',
  timelineScrolled: false,
};

const passOverlay = new PassOverlay();
let formatter = new TimeFormatter(false);
let tickCount = 0;

/* ---------- persistence ---------- */

function savePrefs() {
  const { setup } = els;
  writeJson(PREFS_KEY, {
    lat: setup.lat.value,
    lon: setup.lon.value,
    alt: setup.alt.value,
    minEl: setup.minEl.value,
    hours: setup.hours.value,
    utc: setup.utc.checked,
    view: state.view,
    selId: state.selectedId,
  });
}

function saveLibrary() {
  writeJson(LIBRARY_KEY, state.library);
}

/* ---------- derived values ---------- */

const hasLocation = () => els.setup.lat.value !== '' && els.setup.lon.value !== '';

function findCurrentAndNext(nowMs) {
  let current = null;
  let next = null;
  for (const pass of state.upcoming) {
    if (pass.aos <= nowMs && pass.los > nowMs) {
      current = pass;
    } else if (pass.aos > nowMs) {
      next = pass;
      break;
    }
  }
  return { current, next };
}

function renderContext(nowMs) {
  return {
    nowMs,
    formatter,
    positionAt: (timeMs) => state.tracker.positionAt(timeMs),
    satName: state.satName,
    minElevation: state.minElevation,
    hours: state.hours,
  };
}

function passByTag(tag) {
  if (!tag) {
    return null;
  }
  const index = parseInt(tag.substring(1), 10);
  return tag[0] === UPCOMING_TAG ? state.upcoming[index] : state.past[index];
}

/* ---------- rendering ---------- */

function refreshLibraryOptions() {
  if (state.library.length && !findEntry(state.library, state.selectedId)) {
    state.selectedId = state.library[0].id;
  }
  renderLibraryOptions(state.library, state.selectedId);
}

function renderPasses() {
  if (!state.tracker) {
    hidePasses();
    return;
  }
  renderViewToggle(state.view);
  const context = renderContext(Date.now());
  if (state.view !== 'timeline') {
    renderUpcomingList(state.upcoming, context);
    return;
  }
  const scroller = renderTimelineView(state.upcoming, context, state.timelineScrolled);
  if (scroller) {
    scroller.addEventListener('scroll', () => {
      state.timelineScrolled = true;
    });
  }
}

function renderHistoryPanel() {
  if (!state.tracker) {
    hideHistory();
    return;
  }
  renderHistory(state.past, renderContext(Date.now()));
}

function renderHeroCard() {
  if (!state.tracker) {
    return;
  }
  const nowMs = Date.now();
  const { current, next } = findCurrentAndNext(nowMs);
  const look = state.tracker.lookAt(new Date(nowMs));
  renderHero({
    ...renderContext(nowMs),
    current,
    currentIndex: current ? state.upcoming.indexOf(current) : -1,
    next,
    look,
    subPoint: look ? state.tracker.subPoint(look) : null,
  });
}

function renderSummaryLine() {
  if (!state.tracker) {
    renderSetupSummary('');
    return;
  }
  renderSetupSummary(`${els.setup.lat.value}, ${els.setup.lon.value} · ≥${state.minElevation}° · ${state.hours} h`);
}

function renderAgeLine() {
  if (!state.tracker) {
    els.hero.age.textContent = '';
    return;
  }
  renderEpochAge(state.tracker.epochMs(), Date.now());
}

function renderEverything() {
  renderAgeLine();
  renderSummaryLine();
  renderPasses();
  renderHistoryPanel();
  renderHeroCard();
}

function clearSatellite() {
  state.tracker = null;
  state.upcoming = [];
  state.past = [];
  renderHeroEmpty();
  renderPasses();
  renderHistoryPanel();
  renderAgeLine();
  renderSummaryLine();
}

/* ---------- inputs ---------- */

// Moves whatever is in the paste box into the library. Returns how many sets it found.
function saveTextareaToLibrary() {
  const sets = parseTles(els.setup.tle.value);
  if (!sets.length) {
    return 0;
  }
  state.selectedId = upsertSets(state.library, sets, Date.now()) || state.selectedId;
  saveLibrary();
  els.setup.tle.value = '';
  refreshLibraryOptions();
  return sets.length;
}

function readSearchSettings() {
  const { setup } = els;
  let minElevation = parseFloat(setup.minEl.value);
  if (Number.isNaN(minElevation)) {
    minElevation = DEFAULT_MIN_ELEVATION;
  }
  let hours = parseFloat(setup.hours.value);
  if (Number.isNaN(hours) || hours < 1) {
    hours = DEFAULT_LOOKAHEAD_HOURS;
  }
  hours = Math.min(hours, MAX_LOOKAHEAD_HOURS);
  setup.minEl.value = minElevation;
  setup.hours.value = hours;
  return { minElevation, hours };
}

function readObserver() {
  const { setup } = els;
  const latitude = parseCoordinate(setup.lat.value);
  const longitude = parseCoordinate(setup.lon.value);
  const isValid = !Number.isNaN(latitude) && !Number.isNaN(longitude)
    && Math.abs(latitude) <= MAX_LATITUDE && Math.abs(longitude) <= MAX_LONGITUDE;
  if (!isValid) {
    return null;
  }
  return makeObserver(latitude, longitude, parseAltitudeMetres(setup.alt.value));
}

/* ---------- compute ---------- */

function compute(quiet) {
  if (typeof globalThis.satellite === 'undefined') {
    showMessage('The propagation library did not load. Reload the page.', true);
    return;
  }
  const savedCount = saveTextareaToLibrary();
  const entry = findEntry(state.library, state.selectedId) || state.library[0];
  if (!entry) {
    showMessage('Paste a TLE (line 1 and line 2, name optional) or load a file.', true);
    return;
  }
  state.selectedId = entry.id;
  els.library.select.value = entry.id;
  const observer = readObserver();
  if (!observer) {
    showMessage('Enter a latitude between −90 and 90 and a longitude between −180 and 180.', true);
    els.setup.panel.open = true;
    return;
  }
  const { minElevation, hours } = readSearchSettings();
  const satrec = createSatrec(entry.l1, entry.l2);
  if (!satrec) {
    showMessage(`The TLE for ${entry.name} could not be parsed.`, true);
    return;
  }
  state.tracker = new Tracker(satrec, observer, minElevation);
  state.satName = entry.name;
  state.minElevation = minElevation;
  state.hours = hours;
  const nowMs = Date.now();
  let passes = [];
  try {
    passes = state.tracker.findPasses(nowMs - HISTORY_WINDOW_MS, nowMs + hours * MS_PER_HOUR);
  } catch (error) {
    showMessage('Propagation failed for this TLE. It may have decayed or the elements may be corrupt.', true);
  }
  state.past = passes.filter((pass) => pass.los <= nowMs);
  state.upcoming = passes.filter((pass) => pass.los > nowMs);
  state.computedAt = nowMs;
  state.timelineScrolled = false;
  if (!quiet) {
    const saved = savedCount ? `Saved ${savedCount} to library. ` : '';
    const count = state.upcoming.length;
    showMessage(`${saved}${count}${count === 1 ? ' pass' : ' passes'} ahead for ${entry.name}. Times in ${formatter.zoneName()}.`);
  }
  savePrefs();
  renderEverything();
  if (state.upcoming.length && !quiet) {
    els.setup.panel.open = false;
  }
}

function computeIfLocated(quiet) {
  if (hasLocation()) {
    compute(quiet);
  }
}

/* ---------- share link and URL import ---------- */

function buildShareLink() {
  const { setup } = els;
  const base = location.href.split('#')[0].split('?')[0];
  let entry = findEntry(state.library, state.selectedId);
  if (!entry) {
    [entry] = parseTles(setup.tle.value);
  }
  if (!entry) {
    return null;
  }
  const params = [`tle=${encodeURIComponent(`${entry.name}\n${entry.l1}\n${entry.l2}`)}`];
  if (hasLocation()) {
    params.push(`lat=${encodeURIComponent(setup.lat.value)}`, `lon=${encodeURIComponent(setup.lon.value)}`);
    if (setup.alt.value !== '') {
      params.push(`alt=${encodeURIComponent(setup.alt.value)}`);
    }
  }
  params.push(`minel=${encodeURIComponent(setup.minEl.value)}`);
  return `${base}#${params.join('&')}`;
}

function parseLinkParams(fragment) {
  const params = {};
  for (const pair of fragment.split('&')) {
    const separator = pair.indexOf('=');
    if (separator < 0) {
      continue;
    }
    try {
      params[pair.substring(0, separator)] = decodeURIComponent(pair.substring(separator + 1).replace(/\+/g, ' '));
    } catch (error) {
      // A malformed escape in one field should not discard the others.
    }
  }
  return params;
}

function importFromUrl() {
  const fragment = location.hash.replace(/^#/, '') || location.search.replace(/^\?/, '');
  if (!fragment || !fragment.includes('tle=')) {
    return false;
  }
  const params = parseLinkParams(fragment);
  const sets = parseTles((params.tle || '').replace(/\r/g, ''));
  if (!sets.length) {
    showMessage('The link contained no readable TLE.', true);
    return false;
  }
  state.selectedId = upsertSets(state.library, sets, Date.now());
  saveLibrary();
  refreshLibraryOptions();
  const { setup } = els;
  if (params.lat != null) {
    setup.lat.value = params.lat;
  }
  if (params.lon != null) {
    setup.lon.value = params.lon;
  }
  if (params.alt != null) {
    setup.alt.value = params.alt;
  }
  if (params.minel != null) {
    setup.minEl.value = params.minel;
  }
  try {
    history.replaceState(null, '', location.pathname);
  } catch (error) {
    // Not allowed on some origins; the hash simply stays in the address bar.
  }
  savePrefs();
  if (hasLocation()) {
    compute(false);
  } else {
    showMessage('TLE loaded from link. Enter your location and compute.');
    setup.panel.open = true;
  }
  return true;
}

/* ---------- event handlers ---------- */

function onSaveLibrary() {
  const count = saveTextareaToLibrary();
  if (!count) {
    showMessage('No valid TLE in the box. Paste line 1 and line 2 (a name line above them is optional).', true);
    return;
  }
  showMessage(`Saved ${count}${count === 1 ? ' satellite' : ' satellites'} to the library.`);
  savePrefs();
  computeIfLocated(true);
}

function onRemoveSelected() {
  const entry = findEntry(state.library, state.selectedId);
  if (!entry) {
    showMessage('Nothing selected to remove.', true);
    return;
  }
  if (!confirm(`Remove ${entry.name} from the library?`)) {
    return;
  }
  state.library = state.library.filter((candidate) => candidate.id !== entry.id);
  saveLibrary();
  state.selectedId = state.library.length ? state.library[0].id : '';
  refreshLibraryOptions();
  savePrefs();
  if (state.library.length && hasLocation()) {
    compute(true);
  } else {
    clearSatellite();
  }
  showMessage(`Removed ${entry.name}.`);
}

function onFileChosen() {
  const file = els.setup.fileInput.files && els.setup.fileInput.files[0];
  if (!file) {
    return;
  }
  if (file.size > MAX_TLE_FILE_BYTES) {
    showMessage('That file is over 2 MB. Trim it to the satellites you need.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const sets = parseTles(String(reader.result || ''));
    if (!sets.length) {
      showMessage(`No TLE sets found in ${file.name}.`, true);
      return;
    }
    const lastId = upsertSets(state.library, sets, Date.now());
    state.selectedId = sets.length === 1 ? catalogNumber(sets[0].l1) : lastId;
    saveLibrary();
    refreshLibraryOptions();
    savePrefs();
    showMessage(`Saved ${sets.length}${sets.length === 1 ? ' satellite' : ' satellites'} from ${file.name} to the library.`);
    computeIfLocated(true);
  };
  reader.onerror = () => showMessage(`Could not read ${file.name}.`, true);
  reader.readAsText(file);
}

function onShare() {
  const link = buildShareLink();
  if (!link) {
    showMessage('Save or paste a TLE first, then share.', true);
    return;
  }
  showShareLink(link);
  const ready = () => showMessage('Link ready. Email it to yourself; opening it loads this satellite.');
  if (navigator.share) {
    navigator.share({ title: 'Pass Predictor', text: 'TLE link', url: link }).then(ready).catch(ready);
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(link)
      .then(() => showMessage('Link copied. Email it to yourself; opening it loads this satellite.'))
      .catch(ready);
    return;
  }
  ready();
}

function onZoneToggle() {
  formatter = new TimeFormatter(els.setup.utc.checked);
  renderZoneLabel(formatter.zoneName());
  savePrefs();
  renderPasses();
  renderHistoryPanel();
  renderHeroCard();
  if (passOverlay.isOpen) {
    passOverlay.draw(renderContext(Date.now()));
  }
}

function onLocate() {
  if (!navigator.geolocation) {
    showMessage('Location is not available in this browser. Enter coordinates by hand.', true);
    return;
  }
  showMessage('Getting location…');
  const onPosition = (position) => {
    const { setup } = els;
    setup.lat.value = position.coords.latitude.toFixed(COORDINATE_DECIMALS);
    setup.lon.value = position.coords.longitude.toFixed(COORDINATE_DECIMALS);
    const { altitude } = position.coords;
    if (altitude != null && !Number.isNaN(altitude)) {
      setup.alt.value = Math.round(altitude);
    }
    showMessage(`Location set to ${setup.lat.value}, ${setup.lon.value}.`);
    savePrefs();
  };
  const onDenied = (error) => {
    const reason = error && error.message ? error.message : 'blocked';
    showMessage(`Location was not granted (${reason}). Enter coordinates by hand.`, true);
  };
  try {
    navigator.geolocation.getCurrentPosition(onPosition, onDenied, GEOLOCATION_OPTIONS);
  } catch (error) {
    showMessage('Location is not available here. Enter coordinates by hand.', true);
  }
}

function onSelectView(view) {
  state.view = view;
  if (view === 'timeline') {
    state.timelineScrolled = false;
  }
  savePrefs();
  renderPasses();
}

function onDocumentClick(event) {
  const target = event.target.closest ? event.target.closest('[data-pass]') : null;
  if (!target || els.overlay.root.contains(target)) {
    return;
  }
  const pass = passByTag(target.getAttribute('data-pass'));
  if (pass) {
    passOverlay.open(pass, renderContext(Date.now()));
  }
}

function bindEvents() {
  const { setup, library, passes } = els;
  setup.compute.addEventListener('click', () => compute(false));
  library.select.addEventListener('change', () => {
    state.selectedId = library.select.value;
    savePrefs();
    computeIfLocated(false);
  });
  setup.saveLibrary.addEventListener('click', onSaveLibrary);
  setup.removeSelected.addEventListener('click', onRemoveSelected);
  setup.loadFile.addEventListener('click', () => {
    setup.fileInput.value = '';
    setup.fileInput.click();
  });
  setup.fileInput.addEventListener('change', onFileChosen);
  setup.share.addEventListener('click', onShare);
  setup.utc.addEventListener('change', onZoneToggle);
  setup.locate.addEventListener('click', onLocate);
  passes.listButton.addEventListener('click', () => onSelectView('list'));
  passes.timelineButton.addEventListener('click', () => onSelectView('timeline'));
  document.addEventListener('click', onDocumentClick);
  els.overlay.close.addEventListener('click', () => passOverlay.close());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && passOverlay.isOpen) {
      passOverlay.close();
    }
  });
}

/* ---------- clock ---------- */

function retireEndedPasses(nowMs) {
  const ended = state.upcoming.filter((pass) => pass.los <= nowMs);
  state.past = state.past.concat(ended).filter((pass) => pass.los > nowMs - HISTORY_WINDOW_MS);
  state.upcoming = state.upcoming.filter((pass) => pass.los > nowMs);
}

function tick() {
  if (!state.tracker) {
    return;
  }
  const nowMs = Date.now();
  renderHeroCard();
  if (passOverlay.isOpen) {
    passOverlay.update(renderContext(nowMs));
  }
  if (state.upcoming.length && state.upcoming[0].los <= nowMs) {
    retireEndedPasses(nowMs);
    renderPasses();
    renderHistoryPanel();
  } else if (state.view === 'timeline') {
    tickCount += 1;
    if (tickCount % TIMELINE_REFRESH_TICKS === 0) {
      renderPasses();
    }
  }
  const recomputeAfterMs = Math.min(state.hours * MS_PER_HOUR * RECOMPUTE_WINDOW_FRACTION, RECOMPUTE_MAX_MS);
  if (nowMs - state.computedAt > recomputeAfterMs) {
    compute(true);
  }
}

/* ---------- start-up ---------- */

// Before the library existed, prefs carried the pasted TLE text itself.
function migrateLegacyPrefs() {
  const legacy = readJson(LEGACY_PREFS_KEY, null);
  if (!legacy) {
    return null;
  }
  const sets = parseTles(legacy.tle || '');
  if (sets.length) {
    legacy.selId = upsertSets(state.library, sets, Date.now());
    saveLibrary();
  }
  removeKey(LEGACY_PREFS_KEY);
  return legacy;
}

function restorePrefs(prefs) {
  const { setup } = els;
  setup.lat.value = prefs.lat || '';
  setup.lon.value = prefs.lon || '';
  setup.alt.value = prefs.alt || '';
  if (prefs.minEl) {
    setup.minEl.value = prefs.minEl;
  }
  if (prefs.hours) {
    setup.hours.value = prefs.hours;
  }
  setup.utc.checked = Boolean(prefs.utc);
  state.view = prefs.view === 'timeline' ? 'timeline' : 'list';
  state.selectedId = prefs.selId || '';
}

function start() {
  renderZoneLabel(formatter.zoneName());
  state.library = readJson(LIBRARY_KEY, []);
  const prefs = readJson(PREFS_KEY, null) || migrateLegacyPrefs();
  if (prefs) {
    restorePrefs(prefs);
    formatter = new TimeFormatter(els.setup.utc.checked);
    renderZoneLabel(formatter.zoneName());
  }
  refreshLibraryOptions();
  bindEvents();
  if (!importFromUrl() && state.library.length && hasLocation()) {
    compute(true);
  }
  setInterval(tick, TICK_MS);
}

start();
