import React, { useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getSystemConfig,
  hasAnyPublicAchievementEnabled,
  subscribeToSystemConfig,
} from '../../utils/systemConfig';

type PublicNavKey = 'latest' | 'list' | 'achievements';

function resolvePublicNavKey(pathname: string): PublicNavKey | null {
  if (pathname.startsWith('/public/achievements') || pathname === '/public' || pathname === '/public/') {
    return 'achievements';
  }
  if (pathname === '/public/results/list' || pathname.startsWith('/public/results/list/')) {
    return 'list';
  }
  if (
    pathname === '/public/results' ||
    pathname === '/public/results/latest' ||
    pathname.startsWith('/public/results/latest/')
  ) {
    return 'latest';
  }
  // /public/results/:id — detail is reached via Latest redirect
  if (/^\/public\/results\/\d+\/?$/.test(pathname)) {
    return 'latest';
  }
  return null;
}

function PublicFilterNav({ showAchievements }: { showAchievements: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = resolvePublicNavKey(location.pathname);

  const items: Array<{ key: PublicNavKey; to: string; label: string }> = [
    { key: 'latest', to: '/public/results/latest', label: 'Latest' },
    { key: 'list', to: '/public/results/list', label: 'All results' },
  ];
  if (showAchievements) {
    items.push({ key: 'achievements', to: '/public/achievements', label: 'Achievements' });
  }

  return (
    <div
      className="card"
      style={{ marginBottom: '16px', backgroundColor: '#f5f7fa', border: '1px solid #cfd8dc' }}
    >
      <nav
        aria-label="Public pages"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {items.map((item) => {
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={selected ? 'button-3d' : 'button-filter'}
              aria-current={selected ? 'page' : undefined}
              onClick={() => navigate(item.to)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function PublicResultsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = useSyncExternalStore(subscribeToSystemConfig, getSystemConfig, getSystemConfig);
  const clubName = config.branding?.clubName || 'Spin Master';
  const showAchievements = hasAnyPublicAchievementEnabled(config);

  return (
    <div className="container" style={{ maxWidth: '960px', marginTop: '32px', marginBottom: '48px' }}>
      <div style={{ fontSize: '28px', fontWeight: 600, color: '#2c3e50', marginBottom: '16px', textAlign: 'center' }}>{clubName}</div>
      <PublicFilterNav showAchievements={showAchievements} />
      {children}
    </div>
  );
}

export function PublicResultsNotAvailable() {
  return (
    <PublicResultsShell>
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

export function PublicAchievementsNotAvailable() {
  return (
    <PublicResultsShell>
      <div className="card">
        <p style={{ margin: 0 }}>
          Public achievements are not enabled for this club.
        </p>
        <p style={{ marginTop: '16px' }}>
          <Link to="/public/results/list">Browse tournament results</Link>
        </p>
      </div>
    </PublicResultsShell>
  );
}
