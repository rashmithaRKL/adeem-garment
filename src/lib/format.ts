const numberFormat = new Intl.NumberFormat('en-US');

export const formatNumber = (n: number | null | undefined): string =>
  n == null ? '-' : numberFormat.format(n);

export const formatPercent = (n: number | null | undefined, digits = 1): string =>
  n == null ? '-' : n.toFixed(digits) + '%';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return value.toFixed(1) + ' ' + units[unit];
}

export const compressionRatio = (original: number, compressed: number): string =>
  original === 0 ? '-' : (((original - compressed) / original) * 100).toFixed(1) + '%';

export const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export const formatDateTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
