// polar (az/el) sky plots as svg strings. north up, zenith in the centre,
// horizon on the outer ring. used at three sizes: 64 px on pass cards,
// 260 px in the hero card and 400 px in the overlay.

import { lookAt, isLive } from './passes.js';
import { timeHMS, degrees } from './format.js';

const D2R = Math.PI / 180;

// ids the overlay uses to update the live parts without redrawing the whole plot
export const OVERLAY_IDS = { group: 'ovG', done: 'ovDone', todo: 'ovTodo', dot: 'ovDot', halo: 'ovHalo' };

const n = x => x.toFixed(1);

// returns az/el -> [x, y] for a plot of the given size
export function projector(size, margin) {
  const centre = size / 2;
  const radius = centre - margin;
  return (az, el) => {
    const clamped = Math.max(0, Math.min(90, el));
    const r = radius * (90 - clamped) / 90;
    const a = az * D2R;
    return [centre + r * Math.sin(a), centre - r * Math.cos(a)];
  };
}

function pathFrom(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('');
}

// splits the track into the part already flown (grey) and the part still to
// come, joined at the live position. sat is { satrec, observer }.
export function trackPaths(pass, project, sat, now) {
  const live = isLive(pass, now);
  const done = [];
  const todo = [];

  for (const sample of pass.track) {
    const xy = project(sample.az, sample.el);
    if (live && sample.t <= now) {
      done.push(xy);
    } else {
      if (todo.length === 0 && done.length) todo.push(done[done.length - 1]);
      todo.push(xy);
    }
  }

  let dot = null;
  if (live) {
    const here = lookAt(sat.satrec, sat.observer, new Date(now));
    if (here) {
      dot = project(here.az, here.el);
      done.push(dot);
      if (todo.length) todo[0] = dot;
      else todo.push(dot);
    }
  }

  return { done: pathFrom(done), todo: pathFrom(todo), dot };
}

function grid(size, margin, pass, small) {
  const c = size / 2;
  const R = c - margin;
  const parts = [];

  for (const k of [1, 2 / 3, 1 / 3]) {
    parts.push(`<circle class="ring" cx="${c}" cy="${c}" r="${n(R * k)}"/>`);
  }
  parts.push(`<line class="cross" x1="${c}" y1="${n(c - R)}" x2="${c}" y2="${n(c + R)}"/>`);
  parts.push(`<line class="cross" x1="${n(c - R)}" y1="${c}" x2="${n(c + R)}" y2="${c}"/>`);

  if (small) {
    parts.push(`<text class="lbl" x="${c}" y="${n(c - R + 6)}" text-anchor="middle">N</text>`);
    return parts.join('');
  }

  const off = 13; // compass labels sit just outside the horizon ring
  if (pass.minEl > 0) {
    parts.push(`<circle class="ring minel" cx="${c}" cy="${c}" r="${n(R * (90 - pass.minEl) / 90)}"/>`);
  }
  parts.push(
    `<text class="lbl" x="${c}" y="${n(c - R - off + 4)}" text-anchor="middle">N</text>`,
    `<text class="lbl" x="${n(c + R + off)}" y="${n(c + 4)}" text-anchor="middle">E</text>`,
    `<text class="lbl" x="${c}" y="${n(c + R + off + 4)}" text-anchor="middle">S</text>`,
    `<text class="lbl" x="${n(c - R - off)}" y="${n(c + 4)}" text-anchor="middle">W</text>`,
    `<text class="ellbl" x="${n(c + 3)}" y="${n(c - R * 2 / 3 - 3)}">30°</text>`,
    `<text class="ellbl" x="${n(c + 3)}" y="${n(c - R / 3 - 3)}">60°</text>`,
  );
  return parts.join('');
}

// one dot per minute (or 5 / 10 for long passes), on the minute boundary
function minuteTicks(pass, project, sat) {
  const minute = 60000;
  const lengthMin = (pass.los - pass.aos) / minute;
  const every = lengthMin > 240 ? 10 : lengthMin > 60 ? 5 : 1;
  const first = Math.ceil(pass.aos / minute) * minute;
  const parts = [];

  for (let t = first, i = 0; t < pass.los; t += minute, i++) {
    if (i % every) continue;
    const look = lookAt(sat.satrec, sat.observer, new Date(t));
    if (!look) continue;
    const [x, y] = project(look.az, look.el);
    parts.push(`<circle class="tick" cx="${n(x)}" cy="${n(y)}" r="2.2"/>`);
  }
  return parts.join('');
}

function markers(pass, project, radius, labelled) {
  const horizon = pass.minEl || 0;
  const marks = [
    { az: pass.aosAz, el: horizon, cls: 'aos', title: pass.openStart ? 'START' : 'AOS', when: pass.aos },
    { az: pass.losAz, el: horizon, cls: 'los', title: pass.openEnd ? 'END' : 'LOS', when: pass.los },
    { az: pass.maxAz, el: pass.maxEl, cls: 'peak', title: `PEAK ${degrees(pass.maxEl)}`, when: pass.maxT },
  ];
  const parts = [];

  for (const m of marks) {
    const [x, y] = project(m.az, m.el);
    parts.push(`<circle class="mark ${m.cls}" cx="${n(x)}" cy="${n(y)}" r="${radius}"/>`);
    if (!labelled) continue;

    // push the label outward along the azimuth so it clears the track
    const ux = Math.sin(m.az * D2R);
    const uy = -Math.cos(m.az * D2R);
    let lx = x + ux * 14;
    let ly = y + uy * 14;
    let anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
    if (m.cls === 'peak') {
      lx = x + 10;
      ly = y - 10;
      anchor = 'start';
    }
    const sub = `${timeHMS(new Date(m.when))}, az ${degrees(m.az)}`;
    parts.push(
      `<text class="marklbl" x="${n(lx)}" y="${n(ly)}" text-anchor="${anchor}">${m.title}</text>`,
      `<text class="marksub" x="${n(lx)}" y="${n(ly + 11)}" text-anchor="${anchor}">${sub}</text>`,
    );
  }
  return parts.join('');
}

function liveDot(dot, ids) {
  const cx = dot ? n(dot[0]) : -50;
  const cy = dot ? n(dot[1]) : -50;
  const hidden = dot ? '' : ' visibility="hidden"';
  const haloId = ids ? ` id="${ids.halo}"` : '';
  const dotId = ids ? ` id="${ids.dot}"` : '';
  return `<circle class="dothalo"${haloId} cx="${cx}" cy="${cy}" r="11"${hidden}/>` +
         `<circle class="dot"${dotId} cx="${cx}" cy="${cy}" r="5.5"${hidden}/>`;
}

// opts: { size, margin, small, ticks, labels, live, ids }
//   small   – card version: no compass letters beyond N, tiny markers
//   ticks   – minute ticks along the track
//   labels  – aos / los / peak text next to the markers
//   live    – include the current-position dot
//   ids     – OVERLAY_IDS, so the overlay can update paths in place
export function polarPlot(pass, opts, sat, now = Date.now()) {
  const { size, margin } = opts;
  const project = projector(size, margin);
  const ids = opts.ids || null;
  const paths = trackPaths(pass, project, sat, now);
  const markRadius = opts.small ? 2.6 : opts.labels ? 5 : 4;

  const doneId = ids ? ` id="${ids.done}"` : '';
  const todoId = ids ? ` id="${ids.todo}"` : '';
  const groupId = ids ? ` id="${ids.group}"` : '';

  const body = [
    grid(size, margin, pass, opts.small),
    `<path class="track done"${doneId} d="${paths.done}"/>`,
    `<path class="track"${todoId} d="${paths.todo}"/>`,
    opts.ticks ? minuteTicks(pass, project, sat) : '',
    markers(pass, project, markRadius, opts.labels),
    opts.live ? liveDot(paths.dot, ids) : '',
  ].join('');

  return `<svg class="polar${opts.small ? ' small' : ''}" viewBox="0 0 ${size} ${size}" ` +
         `xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g${groupId}>${body}</g></svg>`;
}
