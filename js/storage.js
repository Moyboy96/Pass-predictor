// Persistence: the localStorage keys this app owns and JSON read/write
// wrappers that never throw (private mode, quota, disabled storage).
// No DOM. Callers decide the shape of what is stored.

export const PREFS_KEY = 'passpredictor.v2';
export const LIBRARY_KEY = 'passpredictor.lib.v1';
export const LEGACY_PREFS_KEY = 'passpredictor.v1'; // pre-library schema, migrated on first load

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage is best effort; the page keeps working without it.
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Same: nothing to do if storage is unavailable.
  }
}
