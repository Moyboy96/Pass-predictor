// element handles, grouped by the part of the page they belong to.

const byId = id => document.getElementById(id);

export const els = {
  tzLabel: byId('tzLabel'),
  library: byId('lib'),

  hero: {
    root: byId('hero'),
    name: byId('heroName'),
    age: byId('heroAge'),
    lead: byId('heroLead'),
    big: byId('heroBig'),
    detail: byId('heroDetail'),
    now: byId('heroNow'),
    nowAz: byId('nowAz'),
    nowEl: byId('nowEl'),
    nowRange: byId('nowRange'),
    nowSub: byId('nowSub'),
    plot: byId('heroPlot'),
    svg: byId('heroSvg'),
    side: byId('heroSide'),
  },

  history: {
    panel: byId('histWrap'),
    summary: byId('histSum'),
    body: byId('history'),
  },

  setup: {
    panel: byId('setup'),
    summary: byId('setupSum'),
    tle: byId('tle'),
    save: byId('saveLib'),
    pick: byId('pick'),
    file: byId('file'),
    remove: byId('removeLib'),
    lat: byId('lat'),
    lon: byId('lon'),
    alt: byId('alt'),
    minEl: byId('minEl'),
    hours: byId('hours'),
    run: byId('run'),
    locate: byId('locate'),
    share: byId('share'),
    utc: byId('utc'),
    msg: byId('msg'),
    linkWrap: byId('linkWrap'),
    linkOut: byId('linkOut'),
  },

  passes: {
    viewbar: byId('viewbar'),
    listButton: byId('vList'),
    timelineButton: byId('vTimeline'),
    root: byId('passes'),
  },

  overlay: {
    root: byId('overlay'),
    name: byId('ovName'),
    times: byId('ovTimes'),
    close: byId('ovClose'),
    plot: byId('ovPlot'),
    foot: byId('ovFoot'),
  },
};

export function setMessage(text, isError = false) {
  els.setup.msg.textContent = text || '';
  els.setup.msg.classList.toggle('err', isError);
}

export function hasLocation() {
  return els.setup.lat.value !== '' && els.setup.lon.value !== '';
}
