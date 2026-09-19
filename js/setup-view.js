// Renders the small pieces of the setup panel and header: the status
// message, the collapsed summary line, the share link field, the zone
// label, and the satellite library dropdown.

import { els } from './dom.js';

export function showMessage(text, isError = false) {
  els.setup.message.textContent = text || '';
  els.setup.message.classList.toggle('err', isError);
}

export function renderZoneLabel(zoneName) {
  els.header.zone.textContent = zoneName;
}

export function renderSetupSummary(summary) {
  els.setup.summary.textContent = summary;
}

export function showShareLink(link) {
  els.setup.linkOut.value = link;
  els.setup.linkWrap.hidden = false;
}

// entries: [{ id, name }] sorted for display; selectedId must be one of them or ''.
export function renderLibraryOptions(entries, selectedId) {
  const select = els.library.select;
  select.innerHTML = '';
  if (!entries.length) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'No satellites saved yet';
    select.appendChild(placeholder);
    return;
  }
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    select.appendChild(option);
  }
  select.value = selectedId;
}
