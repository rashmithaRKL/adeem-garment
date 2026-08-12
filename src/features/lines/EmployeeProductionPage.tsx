import { LinesPage } from './LinesPage';

export function EmployeeProductionPage() {
  return (
    <>
      <p className="banner banner--info">
        You see production figures for the lines you are permitted to view. Buyer contracts, other
        employees' uploads and administrative data are filtered out by row level security — not by
        this page.
      </p>
      <LinesPage />
    </>
  );
}
