// localStorage access. everything is wrapped in try/catch because private
// browsing and full quotas both throw, and the app should still run.

const PREFS_KEY = 'passpredictor.v2';
const LIBRARY_KEY = 'passpredictor.lib.v1';
const LEGACY_PREFS_KEY = 'passpredictor.v1'; // single-tle version, pre library

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // nothing sensible to do; the app keeps working without persistence
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadPrefs() {
  return readJson(PREFS_KEY, null);
}

export function savePrefs(prefs) {
  writeJson(PREFS_KEY, prefs);
}

export function loadLibrary() {
  return readJson(LIBRARY_KEY, []);
}

export function saveLibrary(entries) {
  writeJson(LIBRARY_KEY, entries);
}

// v1 stored one pasted tle inside the prefs. returns the old prefs (with the
// tle text still on them) once, then deletes the key.
export function takeLegacyPrefs() {
  const old = readJson(LEGACY_PREFS_KEY, null);
  if (old) remove(LEGACY_PREFS_KEY);
  return old;
}
