// The full-screen pass plot: opens on a pass, redraws only the live parts
// each second, and owns the pinch/scroll zoom and drag pan of its SVG.
// Zoom is view state local to this overlay; app state stays in main.js.
// context: { satName, nowMs, positionAt, formatter }

import { els } from './dom.js';
import { buildPolarSvg, PolarProjection, splitTrackAtNow } from './polar.js';
import { formatCountdown, formatDuration, formatDegrees, NO_ANGLE } from './format.js';

const PLOT_SIZE = 400; // SVG viewBox edge; the CSS scales it to the screen
const PLOT_MARGIN = 64; // room for compass letters and marker labels outside the horizon
const PLOT_OPTIONS = { size: PLOT_SIZE, margin: PLOT_MARGIN, ticks: true, labels: true, liveDot: true, withIds: true };
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_FACTOR = 1.15; // one notch of scroll
const DOUBLE_TAP_MS = 300;
const HINT = '<div class="hint">Pinch or scroll to zoom, drag to pan, double-tap to reset.</div>';

const overlayEls = els.overlay;

class ZoomState {
  constructor() {
    this.reset();
  }

  reset() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  transform() {
    return `translate(${this.offsetX.toFixed(2)} ${this.offsetY.toFixed(2)}) scale(${this.scale.toFixed(3)})`;
  }
}

function buildFooter(pass, nowMs, positionAt) {
  const isLive = pass.aos <= nowMs && pass.los > nowMs;
  const peak = `<div><span>Peak</span><b>${formatDegrees(pass.maxEl)}</b></div>`;
  const duration = `<div><span>Duration</span><b>${formatDuration(pass.los - pass.aos)}</b></div>`;
  if (isLive) {
    const look = positionAt(nowMs);
    return [
      `<div><span>Azimuth</span><b>${look ? formatDegrees(look.az) : NO_ANGLE}</b></div>`,
      `<div><span>Elevation</span><b>${look ? formatDegrees(look.el) : NO_ANGLE}</b></div>`,
      `<div><span>Sets in</span><b>${formatCountdown(pass.los - nowMs)}</b></div>`,
    ].join('');
  }
  if (pass.aos > nowMs) {
    return `<div><span>Starts in</span><b>${formatCountdown(pass.aos - nowMs)}</b></div>${peak}${duration}`;
  }
  return `<div><span>Ended</span><b>${formatCountdown(nowMs - pass.los)} ago</b></div>${peak}${duration}`;
}

export class PassOverlay {
  constructor() {
    this.pass = null;
    this.zoom = new ZoomState();
    this.projection = new PolarProjection(PLOT_SIZE, PLOT_MARGIN);
  }

  get isOpen() {
    return this.pass !== null;
  }

  open(pass, context) {
    this.pass = pass;
    this.zoom.reset();
    const { formatter } = context;
    const aosText = pass.openStart ? 'earlier' : formatter.time(new Date(pass.aos));
    const losText = pass.openEnd ? 'beyond window' : formatter.time(new Date(pass.los));
    overlayEls.name.textContent = context.satName;
    overlayEls.times.textContent = `${aosText} → ${losText}, ${formatDuration(pass.los - pass.aos)}`;
    overlayEls.root.hidden = false;
    document.body.style.overflow = 'hidden';
    this.draw(context);
  }

  close() {
    overlayEls.root.hidden = true;
    this.pass = null;
    document.body.style.overflow = '';
  }

  // Full redraw: used on open and when the time zone toggles.
  draw(context) {
    if (!this.pass) {
      return;
    }
    overlayEls.plot.innerHTML = buildPolarSvg(this.pass, PLOT_OPTIONS, context);
    this.applyZoom();
    this.bindGestures();
    this.update(context);
  }

  // Per-second refresh: moves the live dot and the done/todo split, rewrites the footer.
  update(context) {
    if (!this.pass) {
      return;
    }
    const track = splitTrackAtNow(this.pass, this.projection, context.nowMs, context.positionAt);
    const donePath = document.getElementById('ovDone');
    const todoPath = document.getElementById('ovTodo');
    const dot = document.getElementById('ovDot');
    const halo = document.getElementById('ovHalo');
    if (donePath) {
      donePath.setAttribute('d', track.done);
    }
    if (todoPath) {
      todoPath.setAttribute('d', track.todo);
    }
    if (dot && halo) {
      this.moveLiveDot(dot, halo, track.dot);
    }
    overlayEls.foot.innerHTML = buildFooter(this.pass, context.nowMs, context.positionAt) + HINT;
  }

  moveLiveDot(dot, halo, point) {
    if (!point) {
      dot.setAttribute('visibility', 'hidden');
      halo.setAttribute('visibility', 'hidden');
      return;
    }
    for (const element of [dot, halo]) {
      element.setAttribute('cx', point[0].toFixed(1));
      element.setAttribute('cy', point[1].toFixed(1));
      element.removeAttribute('visibility');
    }
  }

  applyZoom() {
    const group = document.getElementById('ovG');
    if (group) {
      group.setAttribute('transform', this.zoom.transform());
    }
  }

  resetZoom() {
    this.zoom.reset();
    this.applyZoom();
  }

  bindGestures() {
    const svg = overlayEls.plot.querySelector('svg');
    if (!svg) {
      return;
    }
    const zoom = this.zoom;
    const pointers = new Map();
    let lastPinchDistance = null;
    let lastPinchMidpoint = null;
    let lastTapMs = 0;

    // Client pixels -> viewBox units, allowing for the letterboxed square plot.
    const toSvg = (clientX, clientY) => {
      const box = svg.getBoundingClientRect();
      const unitsPerPixel = PLOT_SIZE / Math.min(box.width, box.height);
      const insetX = (box.width - PLOT_SIZE / unitsPerPixel) / 2;
      const insetY = (box.height - PLOT_SIZE / unitsPerPixel) / 2;
      return {
        x: (clientX - box.left - insetX) * unitsPerPixel,
        y: (clientY - box.top - insetY) * unitsPerPixel,
        unitsPerPixel,
      };
    };

    const zoomAt = (clientX, clientY, factor) => {
      const anchor = toSvg(clientX, clientY);
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.scale * factor));
      const applied = nextScale / zoom.scale;
      zoom.offsetX = anchor.x - (anchor.x - zoom.offsetX) * applied;
      zoom.offsetY = anchor.y - (anchor.y - zoom.offsetY) * applied;
      zoom.scale = nextScale;
      if (nextScale === MIN_ZOOM) {
        zoom.reset();
      }
      this.applyZoom();
    };

    const panBy = (deltaClientX, deltaClientY) => {
      const { unitsPerPixel } = toSvg(0, 0);
      zoom.offsetX += deltaClientX * unitsPerPixel;
      zoom.offsetY += deltaClientY * unitsPerPixel;
      this.applyZoom();
    };

    svg.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try {
        svg.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers refuse capture for synthetic pointers; gestures still work without it.
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastPinchDistance = null;
      const nowMs = Date.now();
      if (nowMs - lastTapMs < DOUBLE_TAP_MS && pointers.size === 1) {
        this.resetZoom();
      }
      lastTapMs = nowMs;
    });

    svg.addEventListener('pointermove', (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        if (zoom.scale > MIN_ZOOM) {
          panBy(event.clientX - previous.x, event.clientY - previous.y);
        }
        return;
      }
      const [first, second] = pointers.values();
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const midpoint = [(first.x + second.x) / 2, (first.y + second.y) / 2];
      if (lastPinchDistance) {
        zoomAt(midpoint[0], midpoint[1], distance / lastPinchDistance);
        if (lastPinchMidpoint) {
          panBy(midpoint[0] - lastPinchMidpoint[0], midpoint[1] - lastPinchMidpoint[1]);
        }
      }
      lastPinchDistance = distance;
      lastPinchMidpoint = midpoint;
    });

    const release = (event) => {
      pointers.delete(event.pointerId);
      lastPinchDistance = null;
      lastPinchMidpoint = null;
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);

    svg.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR);
      },
      { passive: false },
    );
    svg.addEventListener('dblclick', () => this.resetZoom());
  }
}
