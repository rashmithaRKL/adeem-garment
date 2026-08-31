/**
 * The sheets a downloadable template carries that are not data.
 *
 * "Column guide" explains the workbook to whoever has to fill it in; "Lists"
 * holds the values behind the dropdowns, off the table where they cannot crowd
 * the headings. Both are helpers, and neither is ever imported.
 *
 * Left unguarded they are read as data: the guide's "Column" list spells out the
 * very headers the importers look for, so the rejection parser found REJECT QTY
 * on it and reported a page of rows with no line number. Each parser skips them
 * by name instead.
 */
export const GUIDE_SHEET = 'Column guide';
export const LISTS_SHEET = 'Lists';

const HELPER_NAMES =
  /^(column\s*guide|guide|how\s*to\s*fill|instructions?|read\s*me|lists?|dropdown\s*lists?|choices)$/i;

export const isHelperSheet = (name: string): boolean => HELPER_NAMES.test(name.trim());
