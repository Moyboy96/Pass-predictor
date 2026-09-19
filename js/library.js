// the saved-satellite library: one entry per norad id, kept sorted by name.

import { noradId } from './tle.js';
import { loadLibrary, saveLibrary } from './storage.js';

export class Library {
  constructor() {
    this.entries = [];
    this.selectedId = '';
  }

  load() {
    this.entries = loadLibrary();
  }

  save() {
    saveLibrary(this.entries);
  }

  get(id) {
    return this.entries.find(e => e.id === id) || null;
  }

  get selected() {
    return this.get(this.selectedId) || this.entries[0] || null;
  }

  get isEmpty() {
    return this.entries.length === 0;
  }

  // add or replace parsed tle sets; returns the id of the last one added
  add(sets) {
    let lastId = '';
    for (const set of sets) {
      const id = noradId(set.l1);
      const entry = { id, name: set.name, l1: set.l1, l2: set.l2, savedAt: Date.now() };
      const at = this.entries.findIndex(e => e.id === id);
      if (at >= 0) this.entries[at] = entry;
      else this.entries.push(entry);
      lastId = id;
    }
    this.entries.sort((a, b) => a.name.localeCompare(b.name));
    this.save();
    return lastId;
  }

  remove(id) {
    this.entries = this.entries.filter(e => e.id !== id);
    if (this.selectedId === id) this.selectedId = this.entries.length ? this.entries[0].id : '';
    this.save();
  }
}
