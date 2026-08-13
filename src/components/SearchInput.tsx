import { useMemo, useState } from 'react';

/**
 * Filtering happens in the browser, deliberately. These lists are tens to low
 * hundreds of rows and are already fully loaded for the table below, so a round
 * trip per keystroke would make search slower, not faster.
 */
export function SearchInput({ value, onChange, placeholder, count }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Shown beside the box so it is obvious the filter is doing something. */
  count?: { shown: number; total: number };
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
        <span aria-hidden style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, opacity: .6, pointerEvents: 'none'
        }}>🔍</span>
        <input
          className="input"
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingLeft: 32 }}
          aria-label={placeholder}
        />
      </div>
      {count && (
        <span style={{ fontSize: 12, color: 'var(--text-faint)', flex: 'none' }}>
          {count.shown === count.total
            ? `${count.total} total`
            : `${count.shown} of ${count.total}`}
        </span>
      )}
    </div>
  );
}

/**
 * Matches every whitespace-separated term against the row's searchable text, so
 * "line 02 sewing" narrows rather than demanding that exact phrase.
 */
export function useSearch<T>(rows: T[], term: string, toText: (row: T) => string): T[] {
  return useMemo(() => {
    const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((row) => {
      const hay = toText(row).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, term, toText]);
}

export function useSearchTerm() {
  return useState('');
}
