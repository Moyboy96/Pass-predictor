// full-screen plot of one pass with pinch/scroll zoom, drag to pan and
// double-tap to reset. the live dot and track split are updated in place
// once a second rather than redrawing the svg.

import { els } from './dom.js';
import { state, sat } from './state.js';
import { lookAt, isLive } from './passes.js';
import { polarPlot, projector, trackPaths, OVERLAY_IDS } from './polar.js';
import { timeHMS, countdown, duration, degrees } from './format.js';

const SIZE = 400;
const MARGIN = 64;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const WHEEL_STEP = 1.15;
const DOUBLE_TAP_MS = 300;

const overlay = {
  pass: null,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export function overlayPass() {
  return overlay.pass;
}

export function openOverlay(pass) {
  if (!pass) return;
  overlay.pass = pass;
  resetZoom();

  const start = pass.openStart ? 'earlier' : timeHMS(new Date(pass.aos));
  const end = pass.openEnd ? 'beyond window' : timeHMS(new Date(pass.los));
  els.overlay.name.textContent = state.satName;
  els.overlay.times.textContent = `${start} → ${end}, ${duration(pass.los - pass.aos)}`;
  els.overlay.root.hidden = false;
  document.body.style.overflow = 'hidden';
  drawOverlay();
}

export function closeOverlay() {
  els.overlay.root.hidden = true;
  overlay.pass = null;
  document.body.style.overflow = '';
}

export function drawOverlay() {
  if (!overlay.pass) return;
  const opts = { size: SIZE, margin: MARGIN, ticks: true, labels: true, live: true, ids: OVERLAY_IDS };
  els.overlay.plot.innerHTML = polarPlot(overlay.pass, opts, sat());
  applyZoom();
  bindZoom(els.overlay.plot.querySelector('svg'));
  updateOverlayLive();
}

// ---------- live parts ----------

export function updateOverlayLive() {
  const pass = overlay.pass;
  if (!pass) return;
  const now = Date.now();

  const paths = trackPaths(pass, projector(SIZE, MARGIN), sat(), now);
  setPath(OVERLAY_IDS.done, paths.done);
  setPath(OVERLAY_IDS.todo, paths.todo);
  moveDot(paths.dot);

  els.overlay.foot.innerHTML = footer(pass, now) +
    '<div class="hint">Pinch or scroll to zoom, drag to pan, double-tap to reset.</div>';
}

function setPath(id, d) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('d', d);
}

function moveDot(xy) {
  const dot = document.getElementById(OVERLAY_IDS.dot);
  const halo = document.getElementById(OVERLAY_IDS.halo);
  if (!dot || !halo) return;

  for (const el of [dot, halo]) {
    if (xy) {
      el.setAttribute('cx', xy[0].toFixed(1));
      el.setAttribute('cy', xy[1].toFixed(1));
      el.removeAttribute('visibility');
    } else {
      el.setAttribute('visibility', 'hidden');
    }
  }
}

function figure(label, value) {
  return `<div><span>${label}</span><b>${value}</b></div>`;
}

function footer(pass, now) {
  if (isLive(pass, now)) {
    const look = lookAt(state.satrec, state.observer, new Date(now));
    return figure('Azimuth', look ? degrees(look.az) : '–') +
           figure('Elevation', look ? degrees(look.el) : '–') +
           figure('Sets in', countdown(pass.los - now));
  }
  const timing = pass.aos > now
    ? figure('Starts in', countdown(pass.aos - now))
    : figure('Ended', `${countdown(now - pass.los)} ago`);
  return timing +
         figure('Peak', degrees(pass.maxEl)) +
         figure('Duration', duration(pass.los - pass.aos));
}

// ---------- zoom and pan ----------

function resetZoom() {
  overlay.zoom = 1;
  overlay.panX = 0;
  overlay.panY = 0;
}

function applyZoom() {
  const group = document.getElementById(OVERLAY_IDS.group);
  if (!group) return;
  group.setAttribute('transform',
    `translate(${overlay.panX.toFixed(2)} ${overlay.panY.toFixed(2)}) scale(${overlay.zoom.toFixed(3)})`);
}

function bindZoom(svg) {
  if (!svg) return;
  const pointers = new Map();
  let lastDistance = null;
  let lastMid = null;
  let lastTap = 0;

  // client pixels -> svg units. the svg is letterboxed inside its box, so
  // work out the scale and the offset of the square drawing area.
  function toSvg(clientX, clientY) {
    const box = svg.getBoundingClientRect();
    const scale = SIZE / Math.min(box.width, box.height);
    const offX = (box.width - SIZE / scale) / 2;
    const offY = (box.height - SIZE / scale) / 2;
    return { x: (clientX - box.left - offX) * scale, y: (clientY - box.top - offY) * scale, scale };
  }

  function zoomAt(clientX, clientY, factor) {
    const p = toSvg(clientX, clientY);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, overlay.zoom * factor));
    const applied = newZoom / overlay.zoom;
    overlay.panX = p.x - (p.x - overlay.panX) * applied;
    overlay.panY = p.y - (p.y - overlay.panY) * applied;
    overlay.zoom = newZoom;
    if (newZoom === MIN_ZOOM) resetZoom();
    applyZoom();
  }

  function panBy(dxClient, dyClient) {
    const { scale } = toSvg(0, 0);
    overlay.panX += dxClient * scale;
    overlay.panY += dyClient * scale;
    applyZoom();
  }

  svg.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* not all browsers allow it */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastDistance = null;

    const t = Date.now();
    if (t - lastTap < DOUBLE_TAP_MS && pointers.size === 1) {
      resetZoom();
      applyZoom();
    }
    lastTap = t;
  });

  svg.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      if (overlay.zoom > 1) panBy(e.clientX - prev.x, e.clientY - prev.y);
      return;
    }

    // two fingers: zoom about the midpoint, and pan with it as it moves
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    if (lastDistance) {
      zoomAt(mid[0], mid[1], distance / lastDistance);
      if (lastMid) panBy(mid[0] - lastMid[0], mid[1] - lastMid[1]);
    }
    lastDistance = distance;
    lastMid = mid;
  });

  const release = e => {
    pointers.delete(e.pointerId);
    lastDistance = null;
    lastMid = null;
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
  }, { passive: false });

  svg.addEventListener('dblclick', () => {
    resetZoom();
    applyZoom();
  });
}
