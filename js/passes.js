// propagation and pass search on top of satellite-js (window.satellite).
// nothing in here touches the dom, so it can be run in node for testing.
//
// a pass looks like:
//   { aos, los, maxT            epoch ms
//     aosAz, losAz, maxAz, maxEl   degrees
//     minEl                     the elevation mask it was found with
//     openStart, openEnd        true when the pass was cut by the search window
//     track: [{ t, az, el }] }  ~90 samples for plotting

const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;

const TRACK_SAMPLES = 90;
const CROSSING_TOLERANCE_MS = 250;  // bisection stops when aos/los is known this well
const PEAK_TOLERANCE_MS = 500;      // golden-section stops when the peak is known this well
const MAX_PASSES = 600;             // safety cap for long windows on fast orbits

export function makeObserver(latDeg, lonDeg, altMetres) {
  return { latitude: latDeg * D2R, longitude: lonDeg * D2R, height: altMetres / 1000 };
}

// look angles from the observer at one instant, or null if sgp4 failed
export function lookAt(satrec, observer, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv || !pv.position || typeof pv.position !== 'object') return null;

  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const look = satellite.ecfToLookAngles(observer, ecf);

  return {
    az: ((look.azimuth * R2D) % 360 + 360) % 360,
    el: look.elevation * R2D,
    range: look.rangeSat,
    eci: pv.position,
    gmst,
  };
}

// sub-satellite point in degrees, from a lookAt() result
export function subPoint(look) {
  const gd = satellite.eciToGeodetic(look.eci, look.gmst);
  return { lat: gd.latitude * R2D, lon: gd.longitude * R2D };
}

export function tleAgeDays(satrec) {
  const epochMs = (satrec.jdsatepoch - 2440587.5) * 86400e3;
  return (Date.now() - epochMs) / 86400e3;
}

function elevationAt(satrec, observer, t) {
  const look = lookAt(satrec, observer, new Date(t));
  return look ? look.el : -90;
}

// bisect between a and b (ms) for the instant elevation crosses minEl
function refineCrossing(satrec, observer, a, b, minEl) {
  let fa = elevationAt(satrec, observer, a) - minEl;
  for (let i = 0; i < 20 && b - a > CROSSING_TOLERANCE_MS; i++) {
    const mid = (a + b) / 2;
    const fm = elevationAt(satrec, observer, mid) - minEl;
    if ((fm >= 0) === (fa >= 0)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }
  return (a + b) / 2;
}

// golden-section search for the elevation maximum inside [lo, hi]
function refinePeak(satrec, observer, lo, hi) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = elevationAt(satrec, observer, x1);
  let f2 = elevationAt(satrec, observer, x2);

  for (let i = 0; i < 25 && hi - lo > PEAK_TOLERANCE_MS; i++) {
    if (f1 < f2) {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = elevationAt(satrec, observer, x2);
    } else {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = elevationAt(satrec, observer, x1);
    }
  }
  return (lo + hi) / 2;
}

function buildPass(satrec, observer, aos, los, minEl, openStart, openEnd) {
  const track = [];
  let best = { el: -90, t: aos, az: 0 };

  for (let i = 0; i <= TRACK_SAMPLES; i++) {
    const t = aos + (los - aos) * i / TRACK_SAMPLES;
    const look = lookAt(satrec, observer, new Date(t));
    if (!look) continue;
    track.push({ t, az: look.az, el: look.el });
    if (look.el > best.el) best = { el: look.el, t, az: look.az };
  }

  // the coarse maximum is within one sample of the true peak
  const step = (los - aos) / TRACK_SAMPLES;
  const maxT = refinePeak(satrec, observer, Math.max(aos, best.t - step), Math.min(los, best.t + step));
  const peak = lookAt(satrec, observer, new Date(maxT)) || best;
  const start = lookAt(satrec, observer, new Date(aos));
  const end = lookAt(satrec, observer, new Date(los));

  return {
    aos,
    los,
    minEl,
    openStart,
    openEnd,
    aosAz: start ? start.az : 0,
    losAz: end ? end.az : 0,
    maxT,
    maxEl: peak.el,
    maxAz: peak.az,
    track,
  };
}

// all passes above minEl between start and end (epoch ms).
// coarse step is chosen from the orbital period so geo/meo don't take forever.
export function findPasses(satrec, observer, start, end, minEl) {
  const periodMin = (2 * Math.PI) / satrec.no;
  const step = periodMin > 1000 ? 300e3 : periodMin > 200 ? 120e3 : 30e3;

  const passes = [];
  let t = start;
  let inPass = elevationAt(satrec, observer, t) >= minEl;
  let aos = inPass ? start : null;
  let openStart = inPass;

  while (t < end && passes.length < MAX_PASSES) {
    const next = Math.min(t + step, end);
    const el = elevationAt(satrec, observer, next);

    if (!inPass && el >= minEl) {
      aos = refineCrossing(satrec, observer, t, next, minEl);
      inPass = true;
      openStart = false;
    } else if (inPass && el < minEl) {
      const los = refineCrossing(satrec, observer, t, next, minEl);
      passes.push(buildPass(satrec, observer, aos, los, minEl, openStart, false));
      inPass = false;
      openStart = false;
    }
    t = next;
  }

  if (inPass && aos !== null) {
    passes.push(buildPass(satrec, observer, aos, end, minEl, openStart, true));
  }
  return passes;
}

export function isLive(pass, now) {
  return pass.aos <= now && pass.los > now;
}
