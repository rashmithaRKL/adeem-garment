import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Rendered in the footer, right-aligned. */
  actions?: ReactNode | undefined;
  /** Shown above the body in a red banner. */
  error?: string | undefined;
}

/**
 * A dialog, not a div dressed as one. Escape closes it, focus moves inside on
 * open and returns to the trigger on close, and the backdrop is inert to clicks
 * that start inside the panel — dragging to select text in a field should not
 * dismiss the form and lose what was typed.
 */
export function Modal({ title, onClose, children, actions, error }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button'
    )?.focus();

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // The page behind must not scroll while a dialog is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      returnTo.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="modal__head">
          <h3 style={{ font: '600 18px var(--font-heading)', letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 }}>
            {title}
          </h3>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="modal__body">
          {error && <p className="banner banner--error" style={{ marginTop: 0 }}>{error}</p>}
          {children}
        </div>

        {actions && <footer className="modal__foot">{actions}</footer>}
      </div>
    </div>
  );
}

/** A labelled field, so every admin form is laid out the same way. */
export function Field({ label, hint, children }: {
  label: string; hint?: string | undefined; children: ReactNode;
}) {
  return (
    <label className="field" style={{ marginBottom: 12 }}>
      <span>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{hint}</span>}
    </label>
  );
}
