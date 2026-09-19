// rendering for the hero card, the upcoming list, the history panel and the
// library picker. the timeline and the overlay have their own modules.

import { els } from './dom.js';
import { state, sat } from './state.js';
import { lookAt, subPoint, tleAgeDays, isLive } from './passes.js';
import { polarPlot } from './polar.js';
import { timeHMS, timeHM, dayLabel, dayKey, countdown, duration, degrees, plural } from './format.js';

// pass cards carry a tag like "u3" (upcoming[3]) or "p1" (past[1]) so the
// click handler can find the pass again
export function passTag(list, index) {
  return (list === 'past' ? 'p' : 'u') + index;
}

export function passByTag(tag) {
  if (!tag) return null;
  const index = parseInt(tag.slice(1), 10);
  return tag[0] === 'p' ? state.past[index] : state.upcoming[index];
}

export function noPassesMessage(where) {
  return `<p class="none">No passes above ${state.minEl}° in the ${where}.</p>`;
}

// ---------- library picker ----------

export function renderLibrary() {
  const select = els.library;
  const lib = state.library;
  select.innerHTML = '';

  if (lib.isEmpty) {
    select.appendChild(new Option('No satellites saved yet', ''));
    return;
  }
  for (const entry of lib.entries) {
    select.appendChild(new Option(entry.name, entry.id));
  }
  if (!lib.get(lib.selectedId)) lib.selectedId = lib.entries[0].id;
  select.value = lib.selectedId;
}

// ---------- pass cards ----------

function passCard(pass, extraClass, tag) {
  const start = pass.openStart ? 'earlier' : timeHMS(new Date(pass.aos));
  const end = pass.openEnd ? 'beyond window' : timeHMS(new Date(pass.los));
  const thumb = polarPlot(pass, { size: 64, margin: 4, small: true }, sat());

  return `
    <div class="pass ${extraClass}" data-pass="${tag}">
      <div>
        <div class="times">${start}<span class="sep">→</span>${end}</div>
        <div class="peak">peaks <b>${degrees(pass.maxEl)}</b> at ${timeHM(new Date(pass.maxT))}, azimuth ${degrees(pass.maxAz)}</div>
        <div class="meta">rises ${degrees(pass.aosAz)}, sets ${degrees(pass.losAz)}, ${duration(pass.los - pass.aos)}</div>
      </div>
      ${thumb}
    </div>`;
}

export function renderList() {
  const root = els.passes.root;
  if (!state.upcoming.length) {
    root.innerHTML = noPassesMessage(`next ${state.hours} hours`);
    return;
  }

  const now = Date.now();
  let html = '';
  let lastDay = '';
  let nextMarked = false;

  state.upcoming.forEach((pass, i) => {
    const day = dayKey(new Date(pass.aos));
    if (day !== lastDay) {
      html += `<h2>${dayLabel(new Date(pass.aos))}</h2>`;
      lastDay = day;
    }

    let cls = '';
    if (pass.aos <= now) {
      cls = 'live';
    } else if (!nextMarked) {
      cls = 'next';
      nextMarked = true;
    }
    html += passCard(pass, cls, passTag('upcoming', i));
  });

  root.innerHTML = html;
}

export function renderHistory() {
  const { panel, summary, body } = els.history;
  if (!state.satrec) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const count = state.past.length;
  summary.textContent = count ? `${plural(count, 'pass')} in the last 24 h` : 'none in the last 24 h';

  if (!count) {
    body.innerHTML = noPassesMessage('last 24 hours');
    return;
  }
  // newest first
  body.innerHTML = state.past
    .map((pass, i) => passCard(pass, 'past', passTag('past', i)))
    .reverse()
    .join('');
}

// ---------- hero card ----------

function currentAndNext(now) {
  let current = null;
  let next = null;
  for (const pass of state.upcoming) {
    if (isLive(pass, now)) {
      current = pass;
    } else if (pass.aos > now) {
      next = pass;
      break;
    }
  }
  return { current, next };
}

export function renderHero() {
  if (!state.satrec) return;
  const now = Date.now();
  const hero = els.hero;
  const { current, next } = currentAndNext(now);

  hero.root.classList.remove('empty');
  hero.name.textContent = state.satName;
  hero.big.classList.toggle('live', !!current);

  if (current) {
    hero.lead.textContent = 'Above the horizon now';
    hero.big.textContent = current.openEnd ? 'in view' : `sets in ${countdown(current.los - now)}`;
    hero.detail.textContent = current.openEnd
      ? `Still above ${state.minEl}° at the end of the window.`
      : `Sets ${timeHMS(new Date(current.los))} toward ${degrees(current.losAz)}` +
        (next ? `. Next pass ${timeHM(new Date(next.aos))}.` : '.');
  } else if (next) {
    hero.lead.textContent = 'Next pass in';
    hero.big.textContent = countdown(next.aos - now);
    hero.detail.textContent =
      `${timeHMS(new Date(next.aos))} from ${degrees(next.aosAz)}, peaks ${degrees(next.maxEl)} ` +
      `at ${timeHM(new Date(next.maxT))}, ${duration(next.los - next.aos)}.`;
  } else {
    hero.lead.textContent = 'Nothing scheduled';
    hero.big.textContent = 'no passes';
    hero.detail.textContent =
      `None above ${state.minEl}° in the next ${state.hours} hours. Try a lower minimum elevation or a longer window.`;
  }

  const look = renderLiveFigures(now);
  renderLivePlot(current, look);
}

function renderLiveFigures(now) {
  const hero = els.hero;
  const look = lookAt(state.satrec, state.observer, new Date(now));
  hero.now.hidden = !look;
  if (!look) return null;

  const sub = subPoint(look);
  hero.nowAz.textContent = degrees(look.az);
  hero.nowEl.textContent = degrees(look.el);
  hero.nowRange.textContent = `${Math.round(look.range).toLocaleString()} km`;
  hero.nowSub.textContent = `${sub.lat.toFixed(1)}, ${sub.lon.toFixed(1)}`;
  return look;
}

function renderLivePlot(current, look) {
  const hero = els.hero;
  if (!current) {
    hero.plot.hidden = true;
    hero.svg.innerHTML = '';
    return;
  }
  hero.plot.hidden = false;
  hero.svg.innerHTML = polarPlot(current, { size: 260, margin: 30, live: true }, sat());
  hero.svg.dataset.pass = passTag('upcoming', state.upcoming.indexOf(current));
  hero.side.innerHTML =
    `<span class="lbl">Azimuth</span><b>${look ? degrees(look.az) : '–'}</b>` +
    `<span class="lbl">Elevation</span><b>${look ? degrees(look.el) : '–'}</b>` +
    `<div class="hint">Tap plot to enlarge</div>`;
}

export function renderAge() {
  const age = els.hero.age;
  if (!state.satrec) {
    age.textContent = '';
    return;
  }
  const days = tleAgeDays(state.satrec);
  if (days < 0) {
    age.textContent = 'epoch in future';
  } else if (days < 1) {
    age.textContent = `epoch ${Math.round(days * 24)} h old`;
  } else {
    age.textContent = `epoch ${days.toFixed(1)} d old`;
  }
  age.classList.toggle('old', days > 7 || days < -1);
}

export function renderSetupSummary() {
  const s = els.setup;
  s.summary.textContent = state.satrec
    ? `${s.lat.value}, ${s.lon.value} · ≥${state.minEl}° · ${state.hours} h`
    : '';
}

// back to the "nothing loaded" look after the last satellite is removed
export function resetHero() {
  const hero = els.hero;
  hero.root.classList.add('empty');
  hero.name.textContent = 'No satellite loaded';
  hero.lead.textContent = 'Paste a TLE and set your location below.';
  hero.big.textContent = '';
  hero.detail.textContent = '';
  hero.now.hidden = true;
  hero.plot.hidden = true;
  hero.svg.innerHTML = '';
}
