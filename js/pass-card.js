// Pass card markup for the upcoming list and the history panel. Pure
// string building; no DOM. Each card carries data-pass="u<i>" or "p<i>"
// so the entry module can map a tap back to state.upcoming / state.past.

import { buildPolarSvg } from './polar.js';
import { formatDegrees, formatDuration } from './format.js';

const CARD_PLOT_OPTIONS = { size: 64, margin: 4, small: true };

export const UPCOMING_TAG = 'u';
export const PAST_TAG = 'p';

function buildPassCard(pass, className, tag, context) {
  const { formatter } = context;
  const aosText = pass.openStart ? 'earlier' : formatter.time(new Date(pass.aos));
  const losText = pass.openEnd ? 'beyond window' : formatter.time(new Date(pass.los));
  return [
    `<div class="${className}" data-pass="${tag}">`,
    '<div>',
    `<div class="times">${aosText}<span class="sep">→</span>${losText}</div>`,
    `<div class="peak">peaks <b>${formatDegrees(pass.maxEl)}</b> at ${formatter.hourMinute(new Date(pass.maxT))}, azimuth ${formatDegrees(pass.maxAz)}</div>`,
    `<div class="meta">rises ${formatDegrees(pass.aosAz)}, sets ${formatDegrees(pass.losAz)}, ${formatDuration(pass.los - pass.aos)}</div>`,
    '</div>',
    buildPolarSvg(pass, CARD_PLOT_OPTIONS, context),
    '</div>',
  ].join('');
}

export function buildNoPassesMessage(minElevation, hours) {
  return `<p class="none">No passes above ${minElevation}° in the next ${hours} hours.</p>`;
}

// context: { nowMs, positionAt, formatter }
export function buildUpcomingList(upcoming, context) {
  const { formatter, nowMs } = context;
  const parts = [];
  let lastDayKey = '';
  let isFirstUpcoming = true;
  upcoming.forEach((pass, index) => {
    const start = new Date(pass.aos);
    const dayKey = formatter.dayKey(start);
    if (dayKey !== lastDayKey) {
      parts.push(`<h2>${formatter.day(start)}</h2>`);
      lastDayKey = dayKey;
    }
    const isLive = pass.aos <= nowMs;
    let className = 'pass';
    if (isLive) {
      className += ' live';
    } else if (isFirstUpcoming) {
      className += ' next';
    }
    if (!isLive) {
      isFirstUpcoming = false;
    }
    parts.push(buildPassCard(pass, className, `${UPCOMING_TAG}${index}`, context));
  });
  return parts.join('');
}

// Newest first; tags index into the original (oldest-first) array.
export function buildHistoryList(past, minElevation, context) {
  if (!past.length) {
    return `<p class="none">No passes above ${minElevation}° in the last 24 hours.</p>`;
  }
  return past
    .map((pass, index) => buildPassCard(pass, 'pass past', `${PAST_TAG}${index}`, context))
    .reverse()
    .join('');
}

export function historySummary(count) {
  if (!count) {
    return 'none in the last 24 h';
  }
  return `${count}${count === 1 ? ' pass' : ' passes'} in the last 24 h`;
}
