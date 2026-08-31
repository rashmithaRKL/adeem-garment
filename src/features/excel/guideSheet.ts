/**
 * Every downloadable template carries a second sheet explaining its own columns,
 * so the person filling it in does not have to hold the rules in their head or
 * go back to the screen that produced the file.
 *
 * That sheet is documentation, never data. Left unguarded it is read as data:
 * its "Column" list spells out the very headers the importers look for, so the
 * rejection parser found REJECT QTY on it and reported a page of rows with no
 * line number. Each parser skips it by name instead.
 */
export const GUIDE_SHEET = 'Column guide';

const GUIDE_NAMES = /^(column\s*guide|guide|how\s*to\s*fill|instructions?|read\s*me)$/i;

export const isGuideSheet = (name: string): boolean => GUIDE_NAMES.test(name.trim());
