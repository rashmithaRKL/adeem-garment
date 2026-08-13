import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The width a chart may actually draw into, measured rather than assumed.
 *
 * Every chart here is drawn in real pixels instead of a fixed viewBox that the
 * browser scales. A scaled viewBox shrinks the axis labels along with the plot,
 * and at half a card's width they stop being readable — which is the one thing
 * an axis has to be.
 */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string | undefined;
}

export interface TipState {
  /** Pixels from the left and top of the chart box. */
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}

/**
 * The hover layer. A chart on screen is expected to answer "what is that bar
 * exactly?", and a title attribute answers it a second and a half later, in the
 * operating system's font, off the edge of a scrolling panel.
 */
export function ChartTooltip({ tip, boxWidth }: { tip: TipState | null; boxWidth: number }) {
  if (!tip) return null;
  // Clamped so a tooltip on the last bar does not hang outside the card.
  const left = Math.max(64, Math.min(tip.x, Math.max(64, boxWidth - 64)));
  // Near the top of the plot there is no room above the mark, so it flips under
  // it rather than being drawn over whatever card sits above this one.
  const below = tip.y < 70;
  return (
    <div
      className="charttip"
      style={{
        left,
        top: below ? tip.y + 16 : tip.y,
        transform: below ? 'translate(-50%, 0)' : undefined
      }}
      role="presentation"
    >
      <div className="charttip__title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="charttip__row">
          {r.color && <span className="charttip__swatch" style={{ background: r.color }} aria-hidden />}
          <span className="charttip__label">{r.label}</span>
          <span className="charttip__value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  value?: string | undefined;
}

/**
 * Present whenever a chart carries two or more series, because colour on its own
 * is never allowed to be the only way to tell one from another.
 */
export function Legend({ items, columns = false }: { items: LegendItem[]; columns?: boolean }) {
  return (
    <ul className={'legend' + (columns ? ' legend--col' : '')}>
      {items.map((item) => (
        <li key={item.label} className="legend__item">
          <span className="legend__swatch" style={{ background: item.color }} aria-hidden />
          <span className="legend__label">{item.label}</span>
          {item.value && <span className="legend__value">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Said in words rather than drawn as an empty axis, which reads as a bug. */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.55 }}>
      {children}
    </p>
  );
}
