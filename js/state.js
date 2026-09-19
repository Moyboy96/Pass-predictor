// shared mutable state for the current computation. one object, imported by
// the render modules, written only by app.js.

import { Library } from './library.js';

export const HISTORY_MS = 24 * 3600e3; // how far back "earlier" looks

export const state = {
  library: new Library(),

  // set by compute()
  satrec: null,
  satName: '',
  observer: null,
  minEl: 5,
  hours: 48,
  computedAt: 0,

  upcoming: [],   // passes with los in the future, earliest first
  past: [],       // passes that ended within HISTORY_MS, earliest first

  view: 'list',   // or 'timeline'
  timelineScrolled: false,
};

// the pair the plot code needs to propagate
export function sat() {
  return { satrec: state.satrec, observer: state.observer };
}
