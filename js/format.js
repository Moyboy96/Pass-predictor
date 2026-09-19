// text formatting for times, angles and durations.
// this is the only module that knows about the utc toggle, so every
// timestamp on the page goes through here.

let useUtc = false;

export function setUtc(on) {
  useUtc = on;
}

function zone() {
  return useUtc ? 'UTC' : undefined;
}

function dateFormat(options) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone(), hour12: false });
}

export function timeHMS(date) {
  return dateFormat({ hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export function timeHM(date) {
  return dateFormat({ hour: '2-digit', minute: '2-digit' }).format(date);
}

export function dayLabel(date) {
  return dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

// yyyy-mm-dd in the display zone; used to group passes by day
export function dayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone(),
  }).format(date);
}

export function hourOf(date) {
  return parseInt(dateFormat({ hour: '2-digit' }).format(date), 10) % 24;
}

// "sets in 1h 05m", "in 4m 30s", "12s" – for countdowns
export function countdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad2(m)}m`;
  if (m > 0) return `${m}m ${pad2(s)}s`;
  return `${s}s`;
}

// "8 min 12 s", "2 h 15 min" – for pass lengths
export function duration(ms) {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 120) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min ${seconds} s`;
}

export function degrees(value) {
  return `${value.toFixed(1)}°`;
}

export function zoneName() {
  if (useUtc) return 'UTC';
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
    const part = parts.find(p => p.type === 'timeZoneName');
    return part ? part.value : 'local';
  } catch {
    return 'local';
  }
}

// "1 pass", "3 passes", "2 satellites"
export function plural(n, word) {
  if (n === 1) return `${n} ${word}`;
  return `${n} ${word}${word.endsWith('s') ? 'es' : 's'}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
