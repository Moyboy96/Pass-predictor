// Renders the summary card: satellite name and epoch age, countdown text,
// live look angles, and the in-pass polar plot. Reads the view model it is
// given; never touches state or storage.

import { els } from './dom.js';
import { buildPolarSvg } from './polar.js';
import { formatCountdown, formatDuration, formatDegrees, NO_ANGLE } from './format.js';
import { UPCOMING_TAG } from './pass-card.js';
import { MS_PER_DAY } from './units.js';

const HERO_PLOT_OPTIONS = { size: 260, margin: 30, liveDot: true };
const HOURS_PER_DAY = 24;
const STALE_EPOCH_DAYS = 7; // beyond this the elements are worth refreshing
const FUTURE_EPOCH_TOLERANCE_DAYS = 1; // a slightly-future epoch is normal for freshly issued elements

const hero = els.hero;

export function renderHeroEmpty() {
  hero.card.classList.add('empty');
  hero.name.textContent = 'No satellite loaded';
  hero.lead.textContent = 'Paste a TLE and set your location below.';
  hero.big.textContent = '';
  hero.detail.textContent = '';
  hero.nowRow.hidden = true;
  hero.plot.hidden = true;
  hero.age.textContent = '';
}

function renderCountdown(view) {
  const { current, next, nowMs, minElevation, hours, formatter } = view;
  hero.big.classList.toggle('live', Boolean(current));
  if (current) {
    hero.lead.textContent = 'Above the horizon now';
    hero.big.textContent = current.openEnd ? 'in view' : `sets in ${formatCountdown(current.los - nowMs)}`;
    if (current.openEnd) {
      hero.detail.textContent = `Still above ${minElevation}° at the end of the window.`;
    } else {
      const nextText = next ? `. Next pass ${formatter.hourMinute(new Date(next.aos))}.` : '.';
      hero.detail.textContent = `Sets ${formatter.time(new Date(current.los))} toward ${formatDegrees(current.losAz)}${nextText}`;
    }
    return;
  }
  if (next) {
    hero.lead.textContent = 'Next pass in';
    hero.big.textContent = formatCountdown(next.aos - nowMs);
    hero.detail.textContent = `${formatter.time(new Date(next.aos))} from ${formatDegrees(next.aosAz)}, peaks ${formatDegrees(next.maxEl)} at ${formatter.hourMinute(new Date(next.maxT))}, ${formatDuration(next.los - next.aos)}.`;
    return;
  }
  hero.lead.textContent = 'Nothing scheduled';
  hero.big.textContent = 'no passes';
  hero.detail.textContent = `None above ${minElevation}° in the next ${hours} hours. Try a lower minimum elevation or a longer window.`;
}

function renderLiveRow(look, subPoint) {
  if (!look) {
    hero.nowRow.hidden = true;
    return;
  }
  hero.nowRow.hidden = false;
  hero.nowAz.textContent = formatDegrees(look.az);
  hero.nowEl.textContent = formatDegrees(look.el);
  hero.nowRange.textContent = `${Math.round(look.range).toLocaleString()} km`;
  hero.nowSubPoint.textContent = `${subPoint.latitude.toFixed(1)}, ${subPoint.longitude.toFixed(1)}`;
}

function renderLivePlot(view) {
  const { current, currentIndex, look } = view;
  if (!current) {
    hero.plot.hidden = true;
    hero.plotSvg.innerHTML = '';
    return;
  }
  hero.plot.hidden = false;
  hero.plotSvg.innerHTML = buildPolarSvg(current, HERO_PLOT_OPTIONS, view);
  hero.plotSvg.dataset.pass = `${UPCOMING_TAG}${currentIndex}`;
  hero.plotSide.innerHTML = [
    `<span class="lbl">Azimuth</span><b>${look ? formatDegrees(look.az) : NO_ANGLE}</b>`,
    `<span class="lbl">Elevation</span><b>${look ? formatDegrees(look.el) : NO_ANGLE}</b>`,
    '<div class="hint">Tap plot to enlarge</div>',
  ].join('');
}

// view: { satName, current, currentIndex, next, look, subPoint, nowMs,
//         minElevation, hours, formatter, positionAt }
export function renderHero(view) {
  hero.card.classList.remove('empty');
  hero.name.textContent = view.satName;
  renderCountdown(view);
  renderLiveRow(view.look, view.subPoint);
  renderLivePlot(view);
}

export function renderEpochAge(epochMs, nowMs) {
  const ageDays = (nowMs - epochMs) / MS_PER_DAY;
  if (ageDays < 0) {
    hero.age.textContent = 'epoch in future';
  } else {
    const age = ageDays < 1 ? `${Math.round(ageDays * HOURS_PER_DAY)} h` : `${ageDays.toFixed(1)} d`;
    hero.age.textContent = `epoch ${age} old`;
  }
  hero.age.classList.toggle('old', ageDays > STALE_EPOCH_DAYS || ageDays < -FUTURE_EPOCH_TOLERANCE_DAYS);
}
