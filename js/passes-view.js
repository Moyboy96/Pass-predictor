// Renders the upcoming passes region (list or timeline, plus the view
// toggle) and the collapsed history panel. Builds markup through the pure
// modules and only writes it into the page.

import { els } from './dom.js';
import { buildUpcomingList, buildHistoryList, buildNoPassesMessage, historySummary } from './pass-card.js';
import { buildTimeline } from './timeline.js';

const NOW_LINE_SCROLL_MARGIN_PX = 24; // leave the now line a little in from the left edge

const region = els.passes;

export function hidePasses() {
  region.container.innerHTML = '';
  region.viewBar.hidden = true;
}

export function renderViewToggle(view) {
  region.viewBar.hidden = false;
  region.listButton.classList.toggle('on', view === 'list');
  region.timelineButton.classList.toggle('on', view === 'timeline');
}

// context: { nowMs, positionAt, formatter, minElevation, hours }
export function renderUpcomingList(upcoming, context) {
  if (!upcoming.length) {
    region.container.innerHTML = buildNoPassesMessage(context.minElevation, context.hours);
    return;
  }
  region.container.innerHTML = buildUpcomingList(upcoming, context);
}

// Keeps the user's scroll position across refreshes once they have scrolled;
// otherwise parks the now line near the left edge. Returns the scrolling
// element so the caller can watch it.
export function renderTimelineView(upcoming, context, keepScroll) {
  if (!upcoming.length) {
    region.container.innerHTML = buildNoPassesMessage(context.minElevation, context.hours);
    return null;
  }
  const previous = region.container.querySelector('.tlwrap');
  const savedScroll = previous && keepScroll ? previous.scrollLeft : null;
  const { html, nowOffsetPx } = buildTimeline(upcoming, context);
  region.container.innerHTML = html;
  const wrap = region.container.querySelector('.tlwrap');
  wrap.scrollLeft = savedScroll != null ? savedScroll : Math.max(0, nowOffsetPx - NOW_LINE_SCROLL_MARGIN_PX);
  return wrap;
}

export function hideHistory() {
  els.history.panel.hidden = true;
}

export function renderHistory(past, context) {
  els.history.panel.hidden = false;
  els.history.summary.textContent = historySummary(past.length);
  els.history.list.innerHTML = buildHistoryList(past, context.minElevation, context);
}
