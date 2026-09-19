// Polar sky-plot SVG: azimuth clockwise from north, elevation as distance
// from the centre. Pure string building; no DOM. Callers supply a
// `positionAt(timeMs) -> { az, el } | null` callback for live and tick
// positions, and the TimeFormatter used for marker labels.

import { DEGREES_TO_RADIANS } from './propagation.js';
import { formatDegrees } from './format.js';
import { MS_PER_MINUTE, ZENITH_ELEVATION } from './units.js';

const RING_FRACTIONS = [1, 2 / 3, 1 / 3]; // horizon, 30° and 60° elevation rings
const SMALL_NORTH_LABEL_INSET = 6; // px inside the horizon on card-size plots
const COMPASS_LABEL_OFFSET = 13; // px outside the horizon on large plots
const COMPASS_LABEL_BASELINE = 4; // vertical centring nudge for the label font
const ELEVATION_LABEL_OFFSET_X = 3;
const ELEVATION_LABEL_OFFSET_Y = 3;

const TICK_EVERY_MINUTE_MAX = 60; // one tick per minute up to an hour-long pass
const TICK_EVERY_5_MINUTES_MAX = 240; // then every 5 min up to four hours, else every 10
const TICK_RADIUS = 2.2;

const MARKER_RADIUS_SMALL = 2.6;
const MARKER_RADIUS_LABELLED = 5;
const MARKER_RADIUS_PLAIN = 4;
const MARKER_LABEL_DISTANCE = 14; // push labels outward along the radial so they clear the dot
const PEAK_LABEL_OFFSET = 10; // peak sits mid-plot, so its label goes up and right instead
const MARKER_LABEL_LINE_HEIGHT = 11;
const ANCHOR_SIDE_THRESHOLD = 0.3; // sin(az) beyond this reads as clearly east or west

const LIVE_HALO_RADIUS = 11;
const LIVE_DOT_RADIUS = 5.5;
const OFFSCREEN = -50; // parks the hidden live dot outside the viewBox

const fixed1 = (value) => value.toFixed(1);

export class PolarProjection {
  constructor(size, margin) {
    this.size = size;
    this.centre = size / 2;
    this.radius = this.centre - margin;
  }

  project(azimuthDeg, elevationDeg) {
    const clamped = Math.max(0, Math.min(ZENITH_ELEVATION, elevationDeg));
    const distance = (this.radius * (ZENITH_ELEVATION - clamped)) / ZENITH_ELEVATION;
    const angle = azimuthDeg * DEGREES_TO_RADIANS;
    return [this.centre + distance * Math.sin(angle), this.centre - distance * Math.cos(angle)];
  }
}

// Splits the track into the part already flown (`done`) and the rest
// (`todo`), joined at the live position when the pass is in progress.
export function splitTrackAtNow(pass, projection, nowMs, positionAt) {
  const isLive = pass.aos <= nowMs && pass.los > nowMs;
  let done = '';
  let todo = '';
  let lastDone = null;
  let dot = null;
  const toSegment = ([x, y]) => `${fixed1(x)} ${fixed1(y)}`;
  for (const point of pass.track) {
    const segment = toSegment(projection.project(point.az, point.el));
    if (isLive && point.t <= nowMs) {
      done += (done ? 'L' : 'M') + segment;
      lastDone = segment;
      continue;
    }
    if (!todo && lastDone) {
      todo = `M${lastDone}`;
    }
    todo += (todo ? 'L' : 'M') + segment;
  }
  if (isLive) {
    const now = positionAt(nowMs);
    if (now) {
      dot = projection.project(now.az, now.el);
      const segment = toSegment(dot);
      done += (done ? 'L' : 'M') + segment;
      todo = `M${segment}${todo.replace(/^M[^L]*/, '')}`;
    }
  }
  return { done, todo, dot };
}

function buildRings(projection) {
  const { centre, radius } = projection;
  const rings = RING_FRACTIONS.map(
    (fraction) => `<circle class="ring" cx="${centre}" cy="${centre}" r="${fixed1(radius * fraction)}"/>`,
  );
  rings.push(
    `<line class="cross" x1="${centre}" y1="${fixed1(centre - radius)}" x2="${centre}" y2="${fixed1(centre + radius)}"/>`,
    `<line class="cross" x1="${fixed1(centre - radius)}" y1="${centre}" x2="${fixed1(centre + radius)}" y2="${centre}"/>`,
  );
  return rings;
}

function buildCompassLabels(projection, pass, isSmall) {
  const { centre, radius } = projection;
  if (isSmall) {
    return [`<text class="lbl" x="${centre}" y="${fixed1(centre - radius + SMALL_NORTH_LABEL_INSET)}" text-anchor="middle">N</text>`];
  }
  const parts = [];
  if (pass.minEl > 0) {
    const cutoffRadius = (radius * (ZENITH_ELEVATION - pass.minEl)) / ZENITH_ELEVATION;
    parts.push(`<circle class="ring minel" cx="${centre}" cy="${centre}" r="${fixed1(cutoffRadius)}"/>`);
  }
  const outside = radius + COMPASS_LABEL_OFFSET;
  parts.push(
    `<text class="lbl" x="${centre}" y="${fixed1(centre - outside + COMPASS_LABEL_BASELINE)}" text-anchor="middle">N</text>`,
    `<text class="lbl" x="${fixed1(centre + outside)}" y="${fixed1(centre + COMPASS_LABEL_BASELINE)}" text-anchor="middle">E</text>`,
    `<text class="lbl" x="${centre}" y="${fixed1(centre + outside + COMPASS_LABEL_BASELINE)}" text-anchor="middle">S</text>`,
    `<text class="lbl" x="${fixed1(centre - outside)}" y="${fixed1(centre + COMPASS_LABEL_BASELINE)}" text-anchor="middle">W</text>`,
    `<text class="ellbl" x="${fixed1(centre + ELEVATION_LABEL_OFFSET_X)}" y="${fixed1(centre - (radius * 2) / 3 - ELEVATION_LABEL_OFFSET_Y)}">30°</text>`,
    `<text class="ellbl" x="${fixed1(centre + ELEVATION_LABEL_OFFSET_X)}" y="${fixed1(centre - radius / 3 - ELEVATION_LABEL_OFFSET_Y)}">60°</text>`,
  );
  return parts;
}

function tickIntervalMinutes(pass) {
  const durationMinutes = (pass.los - pass.aos) / MS_PER_MINUTE;
  if (durationMinutes > TICK_EVERY_5_MINUTES_MAX) {
    return 10;
  }
  if (durationMinutes > TICK_EVERY_MINUTE_MAX) {
    return 5;
  }
  return 1;
}

function buildMinuteTicks(pass, projection, positionAt) {
  const every = tickIntervalMinutes(pass);
  const firstMinuteMs = Math.ceil(pass.aos / MS_PER_MINUTE) * MS_PER_MINUTE;
  const ticks = [];
  for (let timeMs = firstMinuteMs; timeMs < pass.los; timeMs += MS_PER_MINUTE) {
    const minuteIndex = Math.round((timeMs - firstMinuteMs) / MS_PER_MINUTE);
    if (minuteIndex % every) {
      continue;
    }
    const look = positionAt(timeMs);
    if (!look) {
      continue;
    }
    const [x, y] = projection.project(look.az, look.el);
    ticks.push(`<circle class="tick" cx="${fixed1(x)}" cy="${fixed1(y)}" r="${TICK_RADIUS}"/>`);
  }
  return ticks;
}

function markerDefinitions(pass, formatter) {
  const horizon = pass.minEl || 0;
  return [
    {
      az: pass.aosAz,
      el: horizon,
      kind: 'aos',
      title: pass.openStart ? 'START' : 'AOS',
      detail: `${formatter.time(new Date(pass.aos))}, az ${formatDegrees(pass.aosAz)}`,
    },
    {
      az: pass.losAz,
      el: horizon,
      kind: 'los',
      title: pass.openEnd ? 'END' : 'LOS',
      detail: `${formatter.time(new Date(pass.los))}, az ${formatDegrees(pass.losAz)}`,
    },
    {
      az: pass.maxAz,
      el: pass.maxEl,
      kind: 'peak',
      title: `PEAK ${formatDegrees(pass.maxEl)}`,
      detail: `${formatter.time(new Date(pass.maxT))}, az ${formatDegrees(pass.maxAz)}`,
    },
  ];
}

function markerLabelPlacement(marker, [x, y]) {
  if (marker.kind === 'peak') {
    return { x: x + PEAK_LABEL_OFFSET, y: y - PEAK_LABEL_OFFSET, anchor: 'start' };
  }
  const outwardX = Math.sin(marker.az * DEGREES_TO_RADIANS);
  const outwardY = -Math.cos(marker.az * DEGREES_TO_RADIANS);
  let anchor = 'middle';
  if (outwardX > ANCHOR_SIDE_THRESHOLD) {
    anchor = 'start';
  } else if (outwardX < -ANCHOR_SIDE_THRESHOLD) {
    anchor = 'end';
  }
  return { x: x + outwardX * MARKER_LABEL_DISTANCE, y: y + outwardY * MARKER_LABEL_DISTANCE, anchor };
}

function buildMarkers(pass, projection, options, formatter) {
  let radius = MARKER_RADIUS_PLAIN;
  if (options.small) {
    radius = MARKER_RADIUS_SMALL;
  } else if (options.labels) {
    radius = MARKER_RADIUS_LABELLED;
  }
  const parts = [];
  for (const marker of markerDefinitions(pass, formatter)) {
    const point = projection.project(marker.az, marker.el);
    parts.push(`<circle class="mark ${marker.kind}" cx="${fixed1(point[0])}" cy="${fixed1(point[1])}" r="${radius}"/>`);
    if (!options.labels) {
      continue;
    }
    const label = markerLabelPlacement(marker, point);
    parts.push(
      `<text class="marklbl" x="${fixed1(label.x)}" y="${fixed1(label.y)}" text-anchor="${label.anchor}">${marker.title}</text>`,
      `<text class="marksub" x="${fixed1(label.x)}" y="${fixed1(label.y + MARKER_LABEL_LINE_HEIGHT)}" text-anchor="${label.anchor}">${marker.detail}</text>`,
    );
  }
  return parts;
}

function buildLiveDot(dot, withIds) {
  const x = dot ? fixed1(dot[0]) : OFFSCREEN;
  const y = dot ? fixed1(dot[1]) : OFFSCREEN;
  const hidden = dot ? '' : ' visibility="hidden"';
  return [
    `<circle class="dothalo"${withIds ? ' id="ovHalo"' : ''} cx="${x}" cy="${y}" r="${LIVE_HALO_RADIUS}"${hidden}/>`,
    `<circle class="dot"${withIds ? ' id="ovDot"' : ''} cx="${x}" cy="${y}" r="${LIVE_DOT_RADIUS}"${hidden}/>`,
  ];
}

// options: { size, margin, small?, ticks?, labels?, liveDot?, withIds? }
// context: { nowMs, positionAt, formatter }
export function buildPolarSvg(pass, options, context) {
  const projection = new PolarProjection(options.size, options.margin);
  const track = splitTrackAtNow(pass, projection, context.nowMs, context.positionAt);
  const idAttr = (id) => (options.withIds ? ` id="${id}"` : '');
  const parts = [
    `<svg class="polar${options.small ? ' small' : ''}" viewBox="0 0 ${options.size} ${options.size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    options.withIds ? '<g id="ovG">' : '<g>',
    ...buildRings(projection),
    ...buildCompassLabels(projection, pass, options.small),
    `<path class="track done"${idAttr('ovDone')} d="${track.done}"/>`,
    `<path class="track"${idAttr('ovTodo')} d="${track.todo}"/>`,
  ];
  if (options.ticks) {
    parts.push(...buildMinuteTicks(pass, projection, context.positionAt));
  }
  parts.push(...buildMarkers(pass, projection, options, context.formatter));
  if (options.liveDot) {
    parts.push(...buildLiveDot(track.dot, options.withIds));
  }
  parts.push('</g></svg>');
  return parts.join('');
}
