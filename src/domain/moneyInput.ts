export type InputSelection = { start: number; end: number };

// Presentation only: preserve decimals, signs, leading zeros and invalid drafts.
// Forms still validate the ungrouped string before saving.
export function formatMoneyInput(value: string): string {
  if (!/^-?\d*(?:\.\d*)?$/.test(value)) return value;
  const [integer, fraction] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function moneyInputEdit(previous: string, text: string, selection?: InputSelection) {
  const value = text.replaceAll(',', '');
  let prefix = 0;
  while (prefix < previous.length && prefix < text.length && previous[prefix] === text[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < text.length - prefix && previous[previous.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
  let cursor = text.length - suffix;
  if (selection) {
    const insertedLength = text.length - (previous.length - (selection.end - selection.start));
    const candidate = selection.start + Math.max(0, insertedLength);
    if (insertedLength >= 0 && previous.slice(0, selection.start) === text.slice(0, selection.start) && previous.slice(selection.end) === text.slice(candidate)) cursor = candidate;
  }
  const rawCursor = text.slice(0, cursor).replaceAll(',', '').length;
  const formatted = formatMoneyInput(value);
  let position = 0, consumed = 0;
  while (position < formatted.length && consumed < rawCursor) {
    if (formatted[position] !== ',') consumed++;
    position++;
  }
  return { value, selection: { start: position, end: position } };
}
