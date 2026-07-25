import React from 'react';
import { Link } from 'react-router-dom';
import { getSystemConfig } from '../../utils/systemConfig';

export function PublicResultsShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const clubName = getSystemConfig().branding?.clubName || 'Spin Master';

  return (
    <div className="container" style={{ maxWidth: '960px', marginTop: '32px', marginBottom: '48px' }}>
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '28px', fontWeight: 600, color: '#2c3e50', marginBottom: '8px', textAlign: 'center' }}>{clubName}</div>
        <h1 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: 600 }}>{title || 'Tournament Results'}</h1>
        <nav style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px' }}>
          <Link to="/public/results/latest">Latest</Link>
          <Link to="/public/results/list">All results</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

export function PublicResultsNotAvailable() {
  return (
    <PublicResultsShell title="Results not available">
      <div className="card">
        <p style={{ margin: 0 }}>
          These tournament results are not available for public viewing. The tournament may still be
          in progress, cancelled, or not a top-level event.
        </p>
        <p style={{ marginTop: '16px' }}>
          <Link to="/public/results/list">Browse available results</Link>
          {' · '}
          <Link to="/public/results/latest">View latest</Link>
        </p>
      </div>
    </PublicResultsShell>
  );
}
