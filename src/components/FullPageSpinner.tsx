export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" style={{ minHeight: '100vh' }} role="status" aria-live="polite">
      <div className="spinner" />
      <p style={{ margin: 0, fontSize: 13.5 }}>{label}</p>
    </div>
  );
}
