import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  /** Position in a list, so a group of cards arrives in sequence. */
  index?: number;
  /**
   * Cards hold tables, forms and charts. Tilting a surface someone is reading or
   * clicking through is motion sickness, not polish, so depth is opt-in and the
   * default is a plain entrance.
   */
  tilt?: boolean;
}

export function Card({ title, aside, children, style, index = 0, tilt = false }: CardProps) {
  return (
    <section
      className={'card rise' + (tilt ? ' tilt' : '')}
      style={{ ['--i' as string]: index, ...style }}
    >
      {(title || aside) && (
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          {title && <h3 className="card__title" style={{ margin: 0 }}>{title}</h3>}
          <div style={{ marginLeft: 'auto' }}>{aside}</div>
        </header>
      )}
      {children}
    </section>
  );
}
