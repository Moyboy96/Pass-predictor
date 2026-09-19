// Text formatting for instants, durations and angles. TimeFormatter
// renders dates in either the device zone or UTC; the rest are pure
// helpers. No DOM. All durations are milliseconds.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const LONG_DURATION_MINUTES = 120; // beyond this a duration reads better as hours and minutes
const HOURS_IN_DAY = 24;

export class TimeFormatter {
  constructor(useUtc) {
    this.useUtc = useUtc;
  }

  format(date, options) {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: this.useUtc ? 'UTC' : undefined,
      hour12: false,
    }).format(date);
  }

  time(date) {
    return this.format(date, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  hourMinute(date) {
    return this.format(date, { hour: '2-digit', minute: '2-digit' });
  }

  day(date) {
    return this.format(date, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Stable key for grouping by calendar day in the displayed zone.
  dayKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.useUtc ? 'UTC' : undefined,
    }).format(date);
  }

  hourOf(date) {
    return parseInt(this.format(date, { hour: '2-digit' }), 10) % HOURS_IN_DAY;
  }

  zoneName() {
    if (this.useUtc) {
      return 'UTC';
    }
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
      const zone = parts.find((part) => part.type === 'timeZoneName');
      return zone ? zone.value : 'local';
    } catch (error) {
      return 'local';
    }
  }
}

const pad2 = (value) => String(value).padStart(2, '0');

// Countdown style: "1h 05m", "4m 20s", "12s".
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (hours > 0) {
    return `${hours}h ${pad2(minutes)}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad2(seconds)}s`;
  }
  return `${seconds}s`;
}

// Prose style: "11 min 20 s", "2 h 5 min".
export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (minutes >= LONG_DURATION_MINUTES) {
    return `${Math.floor(minutes / SECONDS_PER_MINUTE)} h ${minutes % SECONDS_PER_MINUTE} min`;
  }
  return `${minutes} min ${seconds} s`;
}

export const NO_ANGLE = '–'; // shown when SGP4 cannot give a position

export function formatDegrees(value) {
  return `${value.toFixed(1)}°`;
}
