import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Motion is a preference, not a decoration. Everything here checks it and falls
 * back to the final state immediately -- a supervisor who has asked their OS to
 * stop animations gets the numbers, just without the journey.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A touch screen reports pointer events but never a leave, so a tilt applied on
 * tap would stay stuck at that angle. The CSS neutralises the transform for these
 * devices; this stops the work being done at all.
 */
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

/**
 * Tilts an element toward the pointer. The rotation is written to CSS custom
 * properties rather than to `style.transform`, so the stylesheet keeps ownership
 * of the whole transform and a card can also lift, scale or animate in without
 * this hook and the CSS fighting over one property.
 *
 * Updates are parked in a rAF: pointermove fires far faster than the screen
 * refreshes, and writing a transform per event is how a hover effect turns into
 * dropped frames on the floor PCs this runs on.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 6) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--lift', '0px');
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    if (prefersReducedMotion() || isCoarsePointer()) return;
    const el = ref.current;
    if (!el) return;

    const { left, top, width, height } = el.getBoundingClientRect();
    // -0.5..0.5 from the centre, so the sign gives the direction of tilt.
    const px = (e.clientX - left) / width - 0.5;
    const py = (e.clientY - top) / height - 0.5;

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      // Pointer below centre must tilt the top toward the viewer, hence the negation.
      el.style.setProperty('--rx', (-py * maxDeg).toFixed(2) + 'deg');
      el.style.setProperty('--ry', (px * maxDeg).toFixed(2) + 'deg');
      el.style.setProperty('--lift', '-6px');
      // Where the light lands. The spotlight in the stylesheet reads these.
      el.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
    });
  }, [maxDeg]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return { ref, onPointerMove, onPointerLeave: reset, onBlur: reset };
}

/**
 * Counts from zero to `value` on mount and on every change.
 *
 * Driven by requestAnimationFrame against a timestamp rather than a fixed step
 * per frame, so the run takes the same wall-clock time on a 60 Hz and a 144 Hz
 * screen. The final frame is pinned to the exact target: easing arithmetic lands
 * a hair short, and a KPI reading 94.3999 would be its own bug report.
 */
export function useCountUp(value: number, duration = 900): number {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }

    const from = 0;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic: fast, then settles
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(step);
      else setDisplay(value);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return display;
}

/**
 * Splits a formatted number back into its animated form. Formatting is applied by
 * the caller so that thousands separators, percent signs and decimal places stay
 * wherever they already were.
 */
export function useCountUpText(
  value: number,
  format: (n: number) => string,
  duration = 900
): string {
  return format(useCountUp(value, duration));
}
