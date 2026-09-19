// TLE text: parsing pasted or loaded element sets, reading the catalog
// number, and parsing hand-typed coordinates. No DOM, no storage.
// A parsed set is { name, l1, l2 }; l1/l2 keep their short names because
// the same objects are persisted in the saved library.

const LINE1_PREFIX = '1 ';
const LINE2_PREFIX = '2 ';
const CATALOG_NUMBER_START = 2; // columns 3–7 of line 1 hold the NORAD catalog number
const CATALOG_NUMBER_END = 7;
const THREE_LINE_NAME_PREFIX = /^0 /; // 3LE files prefix the name line with "0 "

export function catalogNumber(line1) {
  return line1.substring(CATALOG_NUMBER_START, CATALOG_NUMBER_END).trim();
}

const isElementLine = (line) => line.startsWith(LINE1_PREFIX) || line.startsWith(LINE2_PREFIX);

function nameFromPrecedingLine(lines, index) {
  if (index === 0) {
    return null;
  }
  const previous = lines[index - 1].trim();
  if (isElementLine(previous)) {
    return null;
  }
  return previous.replace(THREE_LINE_NAME_PREFIX, '');
}

export function parseTles(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim().length);
  const sets = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line1 = lines[index].trim();
    const hasLine2 = index + 1 < lines.length && lines[index + 1].trim().startsWith(LINE2_PREFIX);
    if (!line1.startsWith(LINE1_PREFIX) || !hasLine2) {
      continue;
    }
    const name = nameFromPrecedingLine(lines, index) || `NORAD ${catalogNumber(line1)}`;
    sets.push({ name, l1: line1, l2: lines[index + 1].trim() });
    index += 1;
  }
  return sets;
}

// Accepts "-77.03", "77.03W", "77.03 W", "38.9° N". Returns NaN when unreadable.
export function parseCoordinate(value) {
  const text = String(value == null ? '' : value)
    .trim()
    .toUpperCase()
    .replace(/[°,]/g, ' ')
    .replace(/\s+/g, ' ');
  if (!text) {
    return NaN;
  }
  const sign = /[SW]/.test(text) ? -1 : 1;
  const magnitude = parseFloat(text.replace(/[NSEW]/g, '').trim());
  return Number.isNaN(magnitude) ? NaN : magnitude * sign;
}

export function parseAltitudeMetres(value) {
  return parseFloat(String(value).replace(/[^\d.\-]/g, '')) || 0;
}
