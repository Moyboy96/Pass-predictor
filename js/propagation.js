// Orbit propagation and pass search on top of satellite.js (SGP4), which
// vendor/satellite.min.js installs as a browser global before this runs.
// No DOM. Times are epoch milliseconds. A Tracker binds one element set to
// one observer; a pass is
//   { aos, los, minEl, openStart, openEnd, aosAz, losAz, maxEl, maxT, maxAz,
//     track: [{ t, az, el }] }   angles in degrees, minEl the cutoff used.

import { MS_PER_DAY } from './units.js';

const satellite = globalThis.satellite;

const RADIANS_TO_DEGREES = 180 / Math.PI;
export const DEGREES_TO_RADIANS = Math.PI / 180;
const FULL_CIRCLE_DEGREES = 360;

const LEO_STEP_MS = 30e3; // coarse search step; a LEO pass lasts several minutes so 30 s cannot skip one
const LONG_PERIOD_MINUTES = 200; // above this (MEO) passes last hours, so step 2 min
const MEO_STEP_MS = 120e3;
const GEO_PERIOD_MINUTES = 1000; // above this the geometry barely moves, so step 5 min
const GEO_STEP_MS = 300e3;
const MAX_PASSES = 600; // safety cap for a long window on a fast orbit

const CROSSING_TOLERANCE_MS = 250; // bisect the horizon crossing to a quarter second
const CROSSING_MAX_STEPS = 20;
const TRACK_SAMPLES = 90; // points along the pass for plotting and the coarse peak
const PEAK_TOLERANCE_MS = 500; // golden-section search stops at half-second peak time
const PEAK_MAX_STEPS = 25;
const GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;

const JULIAN_DAY_UNIX_EPOCH = 2440587.5; // JD of 1970-01-01T00:00Z

export function createSatrec(line1, line2) {
  try {
    const satrec = satellite.twoline2satrec(line1, line2);
    return satrec && !satrec.error ? satrec : null;
  } catch (error) {
    return null;
  }
}

export function makeObserver(latitudeDeg, longitudeDeg, altitudeMetres) {
  return {
    latitude: latitudeDeg * DEGREES_TO_RADIANS,
    longitude: longitudeDeg * DEGREES_TO_RADIANS,
    height: altitudeMetres / 1000,
  };
}

const normaliseAzimuth = (degrees) => ((degrees % FULL_CIRCLE_DEGREES) + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;

export class Tracker {
  constructor(satrec, observer, minElevation) {
    this.satrec = satrec;
    this.observer = observer;
    this.minElevation = minElevation;
  }

  epochMs() {
    return (this.satrec.jdsatepoch - JULIAN_DAY_UNIX_EPOCH) * MS_PER_DAY;
  }

  // Look angles from the observer, or null if SGP4 cannot propagate to that date.
  lookAt(date) {
    const state = satellite.propagate(this.satrec, date);
    if (!state || !state.position || typeof state.position !== 'object') {
      return null;
    }
    const gmst = satellite.gstime(date);
    const positionEcf = satellite.eciToEcf(state.position, gmst);
    const look = satellite.ecfToLookAngles(this.observer, positionEcf);
    return {
      el: look.elevation * RADIANS_TO_DEGREES,
      az: normaliseAzimuth(look.azimuth * RADIANS_TO_DEGREES),
      range: look.rangeSat,
      eci: state.position,
      gmst,
    };
  }

  positionAt(timeMs) {
    return this.lookAt(new Date(timeMs));
  }

  elevationAt(timeMs) {
    const look = this.positionAt(timeMs);
    return look ? look.el : -90;
  }

  subPoint(look) {
    const geodetic = satellite.eciToGeodetic(look.eci, look.gmst);
    return {
      latitude: geodetic.latitude * RADIANS_TO_DEGREES,
      longitude: geodetic.longitude * RADIANS_TO_DEGREES,
    };
  }

  // Bisect between a time below the cutoff and one above it (either order).
  refineCrossing(beforeMs, afterMs) {
    let low = beforeMs;
    let high = afterMs;
    let lowAbove = this.elevationAt(low) >= this.minElevation;
    for (let step = 0; step < CROSSING_MAX_STEPS && high - low > CROSSING_TOLERANCE_MS; step += 1) {
      const middle = (low + high) / 2;
      const middleAbove = this.elevationAt(middle) >= this.minElevation;
      if (middleAbove === lowAbove) {
        low = middle;
        lowAbove = middleAbove;
      } else {
        high = middle;
      }
    }
    return (low + high) / 2;
  }

  refinePeak(aroundMs, halfWidthMs, aosMs, losMs) {
    let low = Math.max(aosMs, aroundMs - halfWidthMs);
    let high = Math.min(losMs, aroundMs + halfWidthMs);
    let probeA = high - GOLDEN_RATIO * (high - low);
    let probeB = low + GOLDEN_RATIO * (high - low);
    let elevationA = this.elevationAt(probeA);
    let elevationB = this.elevationAt(probeB);
    for (let step = 0; step < PEAK_MAX_STEPS && high - low > PEAK_TOLERANCE_MS; step += 1) {
      if (elevationA < elevationB) {
        low = probeA;
        probeA = probeB;
        elevationA = elevationB;
        probeB = low + GOLDEN_RATIO * (high - low);
        elevationB = this.elevationAt(probeB);
      } else {
        high = probeB;
        probeB = probeA;
        elevationB = elevationA;
        probeA = high - GOLDEN_RATIO * (high - low);
        elevationA = this.elevationAt(probeA);
      }
    }
    return (low + high) / 2;
  }

  buildPass(aosMs, losMs, openStart, openEnd) {
    const track = [];
    let best = { el: -90, t: aosMs, az: 0 };
    for (let index = 0; index <= TRACK_SAMPLES; index += 1) {
      const timeMs = aosMs + ((losMs - aosMs) * index) / TRACK_SAMPLES;
      const look = this.positionAt(timeMs);
      if (!look) {
        continue;
      }
      track.push({ t: timeMs, az: look.az, el: look.el });
      if (look.el > best.el) {
        best = { el: look.el, t: timeMs, az: look.az };
      }
    }
    const sampleSpacingMs = (losMs - aosMs) / TRACK_SAMPLES;
    const peakMs = this.refinePeak(best.t, sampleSpacingMs, aosMs, losMs);
    const peak = this.positionAt(peakMs);
    const start = this.positionAt(aosMs);
    const end = this.positionAt(losMs);
    return {
      aos: aosMs,
      los: losMs,
      minEl: this.minElevation,
      openStart: Boolean(openStart),
      openEnd: Boolean(openEnd),
      aosAz: start ? start.az : 0,
      losAz: end ? end.az : 0,
      maxEl: peak ? peak.el : best.el,
      maxT: peakMs,
      maxAz: peak ? peak.az : best.az,
      track,
    };
  }

  coarseStepMs() {
    const periodMinutes = (2 * Math.PI) / this.satrec.no; // satrec.no is mean motion in rad/min
    if (periodMinutes > GEO_PERIOD_MINUTES) {
      return GEO_STEP_MS;
    }
    if (periodMinutes > LONG_PERIOD_MINUTES) {
      return MEO_STEP_MS;
    }
    return LEO_STEP_MS;
  }

  // Every interval within [startMs, endMs] where elevation stays at or above the cutoff.
  findPasses(startMs, endMs) {
    const step = this.coarseStepMs();
    const passes = [];
    let timeMs = startMs;
    let isAbove = this.elevationAt(timeMs) >= this.minElevation;
    let aosMs = isAbove ? startMs : null;
    let openStart = isAbove;
    while (timeMs < endMs && passes.length < MAX_PASSES) {
      const nextMs = Math.min(timeMs + step, endMs);
      const nextAbove = this.elevationAt(nextMs) >= this.minElevation;
      if (!isAbove && nextAbove) {
        aosMs = this.refineCrossing(timeMs, nextMs);
        isAbove = true;
        openStart = false;
      } else if (isAbove && !nextAbove) {
        const losMs = this.refineCrossing(timeMs, nextMs);
        passes.push(this.buildPass(aosMs, losMs, openStart, false));
        isAbove = false;
        openStart = false;
      }
      timeMs = nextMs;
    }
    if (isAbove && aosMs !== null) {
      passes.push(this.buildPass(aosMs, endMs, openStart, true));
    }
    return passes;
  }
}

