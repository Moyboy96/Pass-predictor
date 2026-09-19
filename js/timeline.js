// horizontal timeline of the look-ahead window. one bar per pass, height and
// opacity from peak elevation; a red line marks now.

import { els } from './dom.js';
import { state } from './state.js';
import { noPassesMessage, passTag } from './views.js';
import { timeHM, dayLabel, dayKey, hourOf } from './format.js';

const PX_PER_HOUR = 80;
const HOUR_MS = 3600e3;
const MIN_BAR_PX = 6;

export function renderTimeline() {
  const root = els.passes.root;
  if (!state.upcoming.length) {
    root.innerHTML = noPassesMessage(`next ${state.hours} hours`);
    return;
  }

  const now = Date.now();
  const previous = root.querySelector('.tlwrap');
  const keepScroll = previous && state.timelineScrolled ? previous.scrollLeft : null;

  // the axis starts on the hour so the labels land on round times
  const origin = new Date(now);
  origin.setMinutes(0, 0, 0);
  const t0 = origin.getTime();
  const end = now + state.hours * HOUR_MS;
  const width = Math.round(state.hours * PX_PER_HOUR);
  const x = t => ((t - t0) / HOUR_MS * PX_PER_HOUR).toFixed(1);

  const parts = [`<div class="tl"><div class="tlwrap"><div class="tltrack" style="width:${width}px"><div class="tlbase"></div>`];

  let lastDay = '';
  for (let t = t0; t <= end; t += HOUR_MS) {
    const d = new Date(t);
    const hour = hourOf(d);
    const day = dayKey(d);
    parts.push(`<div class="tlh${hour % 6 === 0 ? ' major' : ''}" style="left:${x(t)}px"></div>`);
    if (hour % 2 === 0) parts.push(`<div class="tlhl" style="left:${x(t)}px">${timeHM(d)}</div>`);
    if (day !== lastDay) {
      parts.push(`<div class="tlday" style="left:${x(t)}px">${dayLabel(d)}</div>`);
      lastDay = day;
    }
  }

  state.upcoming.forEach((pass, i) => {
    const fraction = Math.min(1, pass.maxEl / 90);
    const barWidth = Math.max(MIN_BAR_PX, (pass.los - pass.aos) / HOUR_MS * PX_PER_HOUR).toFixed(1);
    const height = Math.round(10 + 50 * fraction);
    const opacity = (0.4 + 0.6 * fraction).toFixed(2);
    const label = `${timeHM(new Date(pass.aos))} · ${Math.round(pass.maxEl)}°`;
    parts.push(
      `<div class="tlbar" data-pass="${passTag('upcoming', i)}" data-lbl="${label}" ` +
      `style="left:${x(pass.aos)}px;width:${barWidth}px;height:${height}px;opacity:${opacity}"></div>`,
    );
  });

  parts.push(`<div class="tlnow" style="left:${x(now)}px"></div>`);
  parts.push('</div></div><div class="tlkey">Scroll sideways. Bar height and shade follow peak elevation; tap a bar for the plot.</div></div>');
  root.innerHTML = parts.join('');

  // keep the user's scroll position on live refreshes, otherwise start at now
  const wrap = root.querySelector('.tlwrap');
  wrap.scrollLeft = keepScroll != null ? keepScroll : Math.max(0, parseFloat(x(now)) - 24);
  wrap.addEventListener('scroll', () => { state.timelineScrolled = true; });
}
