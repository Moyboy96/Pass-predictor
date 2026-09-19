// Handles to the static elements in index.html, grouped by page region.
// Looked up once at load; nothing here reads or writes state.

const byId = (id) => document.getElementById(id);

export const els = {
  header: {
    zone: byId('tzLabel'),
  },
  library: {
    select: byId('lib'),
  },
  hero: {
    card: byId('hero'),
    name: byId('heroName'),
    age: byId('heroAge'),
    lead: byId('heroLead'),
    big: byId('heroBig'),
    detail: byId('heroDetail'),
    nowRow: byId('heroNow'),
    nowAz: byId('nowAz'),
    nowEl: byId('nowEl'),
    nowRange: byId('nowRange'),
    nowSubPoint: byId('nowSub'),
    plot: byId('heroPlot'),
    plotSvg: byId('heroSvg'),
    plotSide: byId('heroSide'),
  },
  history: {
    panel: byId('histWrap'),
    summary: byId('histSum'),
    list: byId('history'),
  },
  setup: {
    panel: byId('setup'),
    summary: byId('setupSum'),
    tle: byId('tle'),
    saveLibrary: byId('saveLib'),
    loadFile: byId('pick'),
    fileInput: byId('file'),
    removeSelected: byId('removeLib'),
    lat: byId('lat'),
    lon: byId('lon'),
    alt: byId('alt'),
    minEl: byId('minEl'),
    hours: byId('hours'),
    compute: byId('run'),
    locate: byId('locate'),
    share: byId('share'),
    utc: byId('utc'),
    message: byId('msg'),
    linkWrap: byId('linkWrap'),
    linkOut: byId('linkOut'),
  },
  passes: {
    viewBar: byId('viewbar'),
    listButton: byId('vList'),
    timelineButton: byId('vTimeline'),
    container: byId('passes'),
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
