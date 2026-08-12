import type { ReactNode } from 'react';
import { friendlyError } from '@/lib/errors';

interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  children: ReactNode;
}

/** One place for the loading, error and empty states every list needs. */
export function QueryState({
  isLoading, error, isEmpty, emptyTitle = 'Nothing here yet',
  emptyBody = 'Records will appear once the first Excel sheet is imported.', children
}: QueryStateProps) {
  if (isLoading) {
    return <div className="state"><div className="spinner" /><p style={{ margin: 0 }}>Loading</p></div>;
  }
  if (error) {
    return <div className="banner banner--error">{friendlyError(error)}</div>;
  }
  if (isEmpty) {
    return (
      <div className="state">
        <h3 style={{ fontSize: 22, margin: 0 }}>{emptyTitle}</h3>
        <p style={{ margin: 0, maxWidth: '46ch', fontSize: 13.5 }}>{emptyBody}</p>
      </div>
    );
  }
  return <>{children}</>;
}
