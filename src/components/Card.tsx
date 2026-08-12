import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}

export function Card({ title, aside, children, style }: CardProps) {
  return (
    <section className="card" style={style}>
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
