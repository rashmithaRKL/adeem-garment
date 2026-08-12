import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="state" style={{ minHeight: '100vh' }}>
      <h1 style={{ fontSize: 46, margin: 0 }}>404</h1>
      <p style={{ margin: 0, fontSize: 15 }}>That page does not exist.</p>
      <Link className="btn btn--primary" to="/" style={{ textDecoration: 'none' }}>Back to my dashboard</Link>
    </div>
  );
}
