import React, { useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getSystemConfig,
  hasAnyPublicAchievementEnabled,
  isPublicPresentBoardEnabled,
  subscribeToSystemConfig,
} from '../../utils/systemConfig';
import { getAuthStateSnapshot, subscribeAuthState } from '../../utils/auth';
import { APP_NAME } from '../../brand';

type PublicNavKey = 'latest' | 'list' | 'achievements' | 'present' | 'join';

function resolvePublicNavKey(pathname: string): PublicNavKey | null {
  if (pathname.startsWith('/public/join')) {
    return 'join';
  }
  if (pathname.startsWith('/public/present')) {
    return 'present';
  }
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

function PublicFilterNav({
  showAchievements,
  showPresentBoard,
}: {
  showAchievements: boolean;
  showPresentBoard: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = resolvePublicNavKey(location.pathname);
  const authenticated = useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, () => false);
  const showBecomeMember = !authenticated;

  const items: Array<{ key: PublicNavKey; to: string; label: string }> = [
    { key: 'latest', to: '/public/results/latest', label: 'Latest' },
    { key: 'list', to: '/public/results/list', label: 'All results' },
  ];
  if (showAchievements) {
    items.push({ key: 'achievements', to: '/public/achievements', label: 'Achievements' });
  }
  if (showPresentBoard) {
    items.push({ key: 'present', to: '/public/present', label: 'Present' });
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
          alignItems: 'center',
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
        {showBecomeMember ? (
          <button
            type="button"
            className="button-cta-member"
            style={{ marginLeft: 'auto' }}
            aria-current={active === 'join' ? 'page' : undefined}
            onClick={() => navigate('/public/join')}
          >
            Become a Member
          </button>
        ) : null}
      </nav>
    </div>
  );
}

export function PublicClubShell({
  children,
  nav,
}: {
  children: React.ReactNode;
  nav?: React.ReactNode;
}) {
  const config = useSyncExternalStore(subscribeToSystemConfig, getSystemConfig, getSystemConfig);
  const clubName = config.branding?.clubName || APP_NAME;

  return (
    <div className="container" style={{ maxWidth: '960px', marginTop: '32px', marginBottom: '48px' }}>
      <div style={{ fontSize: '28px', fontWeight: 600, color: '#2c3e50', marginBottom: '16px', textAlign: 'center' }}>{clubName}</div>
      {nav}
      {children}
    </div>
  );
}

function PublicLessonNav() {
  const navigate = useNavigate();
  const authenticated = useSyncExternalStore(subscribeAuthState, getAuthStateSnapshot, () => false);
  if (authenticated) return null;

  return (
    <div
      className="card"
      style={{ marginBottom: '16px', backgroundColor: '#f5f7fa', border: '1px solid #cfd8dc' }}
    >
      <nav
        aria-label="Account"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <button type="button" className="button-filter" onClick={() => navigate('/')}>
          Log in
        </button>
        <button
          type="button"
          className="button-cta-member"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate('/public/join')}
        >
          Become a Member
        </button>
      </nav>
    </div>
  );
}

export function PublicLessonShell({ children }: { children: React.ReactNode }) {
  return <PublicClubShell nav={<PublicLessonNav />}>{children}</PublicClubShell>;
}

export function PublicResultsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = useSyncExternalStore(subscribeToSystemConfig, getSystemConfig, getSystemConfig);
  const showAchievements = hasAnyPublicAchievementEnabled(config);
  const showPresentBoard = isPublicPresentBoardEnabled(config);

  return (
    <PublicClubShell nav={<PublicFilterNav showAchievements={showAchievements} showPresentBoard={showPresentBoard} />}>
      {children}
    </PublicClubShell>
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

export function PublicPresentNotAvailable() {
  return (
    <PublicResultsShell>
      <div className="card">
        <p style={{ margin: 0 }}>
          The public present board is not enabled for this club.
        </p>
        <p style={{ marginTop: '16px' }}>
          <Link to="/public/results/list">Browse tournament results</Link>
        </p>
      </div>
    </PublicResultsShell>
  );
}
