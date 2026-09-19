// Timeline markup: one horizontally scrolling track across the whole
// look-ahead window, hour ticks, day labels, a bar per pass and a now
// line. Pure string building; no DOM. Returns the markup and the pixel
// offset of "now" so the caller can scroll to it.

import { UPCOMING_TAG } from './pass-card.js';
import { MS_PER_HOUR, ZENITH_ELEVATION } from './units.js';

const PIXELS_PER_HOUR = 80; // wide enough that a 10-minute pass is a tappable 13 px bar
const MAJOR_TICK_EVERY_HOURS = 6;
const LABEL_EVERY_HOURS = 2; // hour labels every 80 px would touch
const MIN_BAR_WIDTH_PX = 6;
const BAR_HEIGHT_BASE_PX = 10; // a grazing pass still shows as a stub
const BAR_HEIGHT_RANGE_PX = 50; // added in proportion to peak elevation
const BAR_OPACITY_BASE = 0.4;
const BAR_OPACITY_RANGE = 0.6;

const elevationFraction = (pass) => Math.min(1, pass.maxEl / ZENITH_ELEVATION);

function buildHourMarks(startMs, endMs, offsetFor, formatter) {
  const parts = [];
  let lastDayKey = '';
  for (let timeMs = startMs; timeMs <= endMs; timeMs += MS_PER_HOUR) {
    const date = new Date(timeMs);
    const hour = formatter.hourOf(date);
    const isMajor = hour % MAJOR_TICK_EVERY_HOURS === 0;
    const left = offsetFor(timeMs);
    parts.push(`<div class="tlh${isMajor ? ' major' : ''}" style="left:${left}px"></div>`);
    if (hour % LABEL_EVERY_HOURS === 0) {
      parts.push(`<div class="tlhl" style="left:${left}px">${formatter.hourMinute(date)}</div>`);
    }
    const dayKey = formatter.dayKey(date);
    if (dayKey !== lastDayKey) {
      parts.push(`<div class="tlday" style="left:${left}px">${formatter.day(date)}</div>`);
      lastDayKey = dayKey;
    }
  }
  return parts;
}

function buildPassBar(pass, index, offsetFor, formatter) {
  const width = Math.max(MIN_BAR_WIDTH_PX, ((pass.los - pass.aos) / MS_PER_HOUR) * PIXELS_PER_HOUR).toFixed(1);
  const height = Math.round(BAR_HEIGHT_BASE_PX + BAR_HEIGHT_RANGE_PX * elevationFraction(pass));
  const opacity = (BAR_OPACITY_BASE + BAR_OPACITY_RANGE * elevationFraction(pass)).toFixed(2);
  const label = `${formatter.hourMinute(new Date(pass.aos))} · ${Math.round(pass.maxEl)}°`;
  const style = `left:${offsetFor(pass.aos)}px;width:${width}px;height:${height}px;opacity:${opacity}`;
  return `<div class="tlbar" data-pass="${UPCOMING_TAG}${index}" data-lbl="${label}" style="${style}"></div>`;
}

// context: { nowMs, hours, formatter }
export function buildTimeline(upcoming, context) {
  const { nowMs, hours, formatter } = context;
  const trackWidth = Math.round(hours * PIXELS_PER_HOUR);
  const start = new Date(nowMs);
  start.setMinutes(0, 0, 0);
  const startMs = start.getTime();
  const endMs = nowMs + hours * MS_PER_HOUR;
  const offsetFor = (timeMs) => (((timeMs - startMs) / MS_PER_HOUR) * PIXELS_PER_HOUR).toFixed(1);
  const parts = [
    '<div class="tl"><div class="tlwrap">',
    `<div class="tltrack" style="width:${trackWidth}px"><div class="tlbase"></div>`,
    ...buildHourMarks(startMs, endMs, offsetFor, formatter),
    ...upcoming.map((pass, index) => buildPassBar(pass, index, offsetFor, formatter)),
    `<div class="tlnow" style="left:${offsetFor(nowMs)}px"></div>`,
    '</div></div>',
    '<div class="tlkey">Scroll sideways. Bar height and shade follow peak elevation; tap a bar for the plot.</div>',
    '</div>',
  ];
  return { html: parts.join(''), nowOffsetPx: parseFloat(offsetFor(nowMs)) };
}
