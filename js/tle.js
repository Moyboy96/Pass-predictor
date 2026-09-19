// two-line element parsing. accepts 2-line and 3-line sets, several in a row,
// with or without the "0 " prefix on name lines.

export function parseTles(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);

  const sets = [];

  for (let i = 0; i < lines.length; i++) {
    const line1 = lines[i].trim();
    const line2 = i + 1 < lines.length ? lines[i + 1].trim() : '';
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;

    sets.push({
      name: nameAbove(lines, i) || `NORAD ${noradId(line1)}`,
      l1: line1,
      l2: line2,
    });
    i++; // skip line 2
  }

  return sets;
}

// the line before line 1 is the name, unless it is itself an element line
function nameAbove(lines, index) {
  if (index === 0) return null;
  const prev = lines[index - 1].trim();
  if (prev.startsWith('1 ') || prev.startsWith('2 ')) return null;
  return prev.replace(/^0 /, '');
}

export function noradId(line1) {
  return line1.substring(2, 7).trim();
}
