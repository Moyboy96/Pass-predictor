// The saved satellite library: a list of { id, name, l1, l2, savedAt }
// keyed by NORAD catalog number and kept sorted by name. Pure functions
// over arrays; main.js owns the array and persists it.

import { catalogNumber } from './tle.js';

export function findEntry(entries, id) {
  return entries.find((entry) => entry.id === id) || null;
}

// Adds or replaces each parsed set. Returns the id of the last set added
// so a single paste selects itself.
export function upsertSets(entries, sets, savedAtMs) {
  let lastId = '';
  for (const set of sets) {
    const id = catalogNumber(set.l1);
    const entry = { id, name: set.name, l1: set.l1, l2: set.l2, savedAt: savedAtMs };
    const existingIndex = entries.findIndex((candidate) => candidate.id === id);
    if (existingIndex >= 0) {
      entries[existingIndex] = entry;
    } else {
      entries.push(entry);
    }
    lastId = id;
  }
  entries.sort((first, second) => first.name.localeCompare(second.name));
  return lastId;
}
