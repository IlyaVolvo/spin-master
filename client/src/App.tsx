import { useState, useEffect, useRef, Suspense, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { getToken, setToken, removeToken, getMember, removeMember, setMember, isAuthenticated, subscribeAuthExpired, consumeAuthExpiredMessage, isAdmin, isKioskMode, getKioskKind, getKioskTournamentId, type KioskKind } from './utils/auth';
import { enterKioskMode, defaultKioskKindForRoles } from './utils/kioskEntry';
import api from './utils/api';
import { connectSocket } from './utils/socket';
import { getSystemConfig, loadPublicSystemConfig, subscribeToSystemConfig, hasAnyPublicAchievementEnabled } from './utils/systemConfig';
import { todayHoursHeaderLabel } from './utils/clubHoursDisplay';
import { clearAllScrollPositions, clearAllUIStates } from './utils/scrollPosition';
import { getErrorMessage } from './utils/errorHandler';
import { loadLastTournamentId, loadShouldRestoreDetail, saveShouldRestoreDetail } from './utils/tournamentNavState';
import { lazyWithReload } from './utils/lazyWithReload';
import { PlayersKioskEntryButton } from './components/PlayersKioskEntryButton';

// Lazy load route components for code splitting (auto-reload once if deploy invalidated chunks)
const Players = lazyWithReload(() => import('./components/Players'));
const Tournaments = lazyWithReload(() => import('./components/Tournaments'));
const TournamentDetailPage = lazyWithReload(() => import('./components/TournamentDetailPage'));
const Statistics = lazyWithReload(() => import('./components/Statistics'));
const History = lazyWithReload(() => import('./components/History'));
const TournamentRegistrationLink = lazyWithReload(() => import('./components/TournamentRegistrationLink'));
const SystemSettings = lazyWithReload(() => import('./components/SystemSettings'));
const PaymentsAdmin = lazyWithReload(() => import('./components/PaymentsAdmin'));
const AttendanceLogAdmin = lazyWithReload(() => import('./components/AttendanceLogAdmin'));
const PublicResultsListPage = lazyWithReload(() => import('./components/public/PublicResultsListPage'));
const PublicResultsLatestPage = lazyWithReload(() =>
  import('./components/public/PublicResultsPages').then((m) => ({ default: m.PublicResultsLatestPage })),
);
const PublicResultsDetailPage = lazyWithReload(() =>
  import('./components/public/PublicResultsPages').then((m) => ({ default: m.PublicResultsDetailPage })),
);
const PublicAchievementsPage = lazyWithReload(() => import('./components/public/PublicAchievementsPage'));

function isUnauthenticatedPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith('/tournament-registration/') ||
    pathname === '/public' ||
    pathname.startsWith('/public/')
  );
}

/** Only render detail for positive numeric ids; otherwise bounce to the list. */
function TournamentDetailGate() {
  const { id } = useParams<{ id: string }>();
  const parsed = id != null ? parseInt(id, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== id) {
    return <Navigate to="/tournaments" replace />;
  }
  return <TournamentDetailPage />;
}

// Component to prevent default scroll restoration for routes that handle their own scroll
function ScrollToTop() {
  const location = useLocation();
  
  useEffect(() => {
    // Only scroll to top if we're not restoring scroll position
    // This prevents React Router's default scroll restoration
    if (!location.state?.restoreScroll) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);
  
  return null;
}

/** Static HTML in public/role-tutorials/ — avoid SPA sending these paths to /players. */
function isRoleTutorialsPath(pathname: string): boolean {
  return pathname === '/role-tutorials' || pathname.startsWith('/role-tutorials/');
}

/**
 * Visiting /role-tutorials (no file) loads the React app first; bounce once to the real static file
 * so public/role-tutorials/index.html is served by Vite (or express static in production).
 */
function RoleTutorialsSpaRedirect() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === '/role-tutorials' || location.pathname === '/role-tutorials/') {
      window.location.replace('/role-tutorials/index.html');
    }
  }, [location.pathname]);
  return null;
}

// Component to handle navigation to /players on initial auth
function AuthRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (isRoleTutorialsPath(location.pathname)) return;
    const validPaths = ['/players', '/tournaments', '/statistics', '/history', '/system-settings', '/payments', '/attendance-log'];
    const isTournamentDetail = /^\/tournaments\/\d+$/.test(location.pathname);
    if (location.pathname.startsWith('/tournaments/') && !isTournamentDetail) {
      navigate('/tournaments', { replace: true });
      return;
    }
    if (!validPaths.includes(location.pathname) && !isTournamentDetail) {
      navigate('/players', { replace: true });
    }
  }, [location.pathname, navigate]);
  
  return null;
}

function App() {
  // Start with false - let useEffect verify authentication
  const [isAuth, setIsAuth] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [clubName, setClubName] = useState<string | null>(null);
  const [authExpiredMessage, setAuthExpiredMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAuthExpired((message) => {
      setIsAuth(false);
      setShowPasswordReset(false);
      setIsCheckingAuth(false);
      setAuthExpiredMessage(message);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPublicSystemConfig()
      .then((res) => {
        if (cancelled) return;
        const name = res.branding?.clubName;
        setClubName(typeof name === 'string' && name.trim() !== '' ? name.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setClubName(null);
      });
    const unsubscribe = subscribeToSystemConfig((config) => {
      if (cancelled) return;
      const name = config.branding?.clubName;
      setClubName(typeof name === 'string' && name.trim() !== '' ? name.trim() : null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuth) return;
    const socket = connectSocket();
    const refreshConfig = () => {
      void loadPublicSystemConfig();
    };
    socket?.on('system:configUpdated', refreshConfig);
    return () => {
      socket?.off('system:configUpdated', refreshConfig);
    };
  }, [isAuth]);

  useEffect(() => {
    const resetParams = new URLSearchParams(window.location.search);
    const isResetLinkFlow = resetParams.get('reset') === '1' && !!resetParams.get('token');

    if (isResetLinkFlow) {
      // Never reuse stale login state when arriving via reset link.
      removeMember();
      removeToken();
      localStorage.clear();
      sessionStorage.clear();
      setIsAuth(false);
      setShowPasswordReset(false);
      setIsCheckingAuth(false);
      return;
    }

    // Check authentication status on mount
    let isMounted = true;
    let timeoutCleared = false;
    
    const checkAuth = async () => {
      try {
        // If we have a member in localStorage, verify session is still valid
        const member = getMember();
        if (member) {
          try {
            const response = await api.get('/auth/member/me');
            if (!isMounted) return;
            
            if (response.data.member) {
              setIsAuth(true);
              // Check if password reset is required
              if (response.data.member.mustResetPassword) {
                setShowPasswordReset(true);
              }
              setIsCheckingAuth(false);
              timeoutCleared = true;
              return;
            }
          } catch (err: any) {
            // Session expired, invalid, or timeout - clear member and token
            if (!isMounted) return;
            console.error('Auth check failed:', err.message || err);
            const expiredMessage =
              (typeof err?.response?.data?.error === 'string' && err.response.data.error) ||
              consumeAuthExpiredMessage() ||
              'Your session has expired. Please log in again.';
            removeMember();
            removeToken();
            setIsAuth(false);
            setAuthExpiredMessage(expiredMessage);
            setIsCheckingAuth(false);
            timeoutCleared = true;
            return;
          }
        }
        
        // Check token-based auth (for backward compatibility)
        if (!isMounted) return;
        const token = getToken();
        if (token) {
          setIsAuth(true);
        } else {
          setIsAuth(false);
        }
        setIsCheckingAuth(false);
        timeoutCleared = true;
        
      } catch (error) {
        if (!isMounted) return;
        console.error('Unexpected error during auth check:', error);
        setIsAuth(false);
        setIsCheckingAuth(false);
        timeoutCleared = true;
      }
    };
    
    // Add a timeout fallback in case the API call hangs
    const timeoutId = setTimeout(() => {
      if (!timeoutCleared && isMounted) {
        console.warn('Auth check timed out, proceeding without auth');
        setIsCheckingAuth(false);
        setIsAuth(false);
      }
    }, 8000); // Reduced timeout to 8 seconds
    
    checkAuth().finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutCleared = true;
      }
    });
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutCleared = true;
      }
    };
  }, []);

  const handleLogin = async () => {
    setAuthExpiredMessage(null);
    // After successful login, verify the session is properly established
    try {
      const response = await api.get('/auth/member/me');
      if (response.data.member) {
        // Update member data in case it changed
        setMember(response.data.member);
        // Check if password reset is required
        if (response.data.member.mustResetPassword) {
          setShowPasswordReset(true);
        }
        setIsAuth(true);
      } else {
        // Session not established, stay on login
        removeMember();
        removeToken();
        setIsAuth(false);
      }
    } catch (err) {
      // Session verification failed, stay on login
      console.error('Session verification failed after login:', err);
      removeMember();
      removeToken();
      setIsAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Try to logout from session if member is logged in
      if (getMember()) {
        await api.post('/auth/member/logout');
      }
    } catch (err) {
      // Ignore errors, continue with cleanup
    }
    removeToken();
    removeMember();
    setIsAuth(false);
  };

  return (
    <Router>
      <ScrollToTop />
      <RoleTutorialsSpaRedirect />
      <AppRoutes
        isCheckingAuth={isCheckingAuth}
        isAuth={isAuth}
        clubName={clubName}
        authExpiredMessage={authExpiredMessage}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        showPasswordReset={showPasswordReset}
        setShowPasswordReset={setShowPasswordReset}
        setMember={setMember}
      />
    </Router>
  );
}

function AppRoutes({
  isCheckingAuth,
  isAuth,
  clubName,
  authExpiredMessage,
  handleLogin,
  handleLogout,
  showPasswordReset,
  setShowPasswordReset,
  setMember,
}: {
  isCheckingAuth: boolean;
  isAuth: boolean;
  clubName: string | null;
  authExpiredMessage: string | null;
  handleLogin: () => void | Promise<void>;
  handleLogout: () => void;
  showPasswordReset: boolean;
  setShowPasswordReset: (show: boolean) => void;
  setMember: (member: any) => void;
}) {
  const location = useLocation();
  const publicPath = isUnauthenticatedPublicPath(location.pathname);

  if (!publicPath && isCheckingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/tournament-registration/:code"
        element={
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>
              <TournamentRegistrationLink />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route path="/public" element={<Navigate to="/public/achievements" replace />} />
      <Route path="/public/" element={<Navigate to="/public/achievements" replace />} />
      <Route
        path="/public/results/list"
        element={
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>
              <PublicResultsListPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route path="/public/results" element={<Navigate to="/public/results/latest" replace />} />
      <Route
        path="/public/results/latest"
        element={
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>
              <PublicResultsLatestPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/public/results/:id"
        element={
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>
              <PublicResultsDetailPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/public/achievements"
        element={
          <ErrorBoundary>
            <Suspense fallback={<div>Loading...</div>}>
              <PublicAchievementsPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="*"
        element={
          !isAuth ? (
            <ErrorBoundary>
              <Login onLogin={handleLogin} clubName={clubName} initialMessage={authExpiredMessage} />
            </ErrorBoundary>
          ) : (
            <>
              <AuthRedirect />
              <div className="container">
                <Header onLogout={handleLogout} clubName={clubName}>
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '50vh',
                            fontSize: '18px',
                          }}
                        >
                          Loading...
                        </div>
                      }
                    >
                      <Routes>
                        <Route path="/" element={<Navigate to="/players" replace />} />
                        <Route path="/players" element={<Players />} />
                        <Route path="/tournaments" element={<Tournaments />} />
                        <Route path="/tournaments/:id" element={<TournamentDetailGate />} />
                        <Route path="/statistics" element={<Statistics />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/system-settings" element={<SystemSettings />} />
                        <Route path="/payments" element={<PaymentsAdmin />} />
                        <Route path="/attendance-log" element={<AttendanceLogAdmin />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </Header>
              </div>

              {showPasswordReset && (
                <PasswordResetModal
                  onPasswordChanged={async () => {
                    try {
                      const response = await api.get('/auth/member/me');
                      if (response.data.member) {
                        setMember(response.data.member);
                        setShowPasswordReset(false);
                      }
                    } catch (err) {
                      setShowPasswordReset(false);
                    }
                  }}
                />
              )}
            </>
          )
        }
      />
    </Routes>
  );
}

// Password Reset Modal Component
function PasswordResetModal({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  /** False when DB password is unset (admin reset / invite) — matches server change-password behavior. */
  const [needsCurrentPassword, setNeedsCurrentPassword] = useState(true);
  const [minimumPasswordLength, setMinimumPasswordLength] = useState(() => getSystemConfig().authPolicy.minimumPasswordLength);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await api.get('/auth/member/me');
        const hp = res.data?.member?.hasPassword as boolean | undefined;
        if (!cancelled && typeof hp === 'boolean') {
          setNeedsCurrentPassword(hp);
        }
      } catch {
        const m = getMember();
        if (!cancelled && typeof m?.hasPassword === 'boolean') {
          setNeedsCurrentPassword(m.hasPassword);
        }
      }
    };
    sync();
    const unsubscribe = subscribeToSystemConfig((config) => {
      setMinimumPasswordLength(config.authPolicy.minimumPasswordLength);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (needsCurrentPassword && !currentPassword.trim()) {
      setError('Current password is required');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('New password and confirmation are required');
      return;
    }

    if (newPassword.length < minimumPasswordLength) {
      setError(`New password must be at least ${minimumPasswordLength} characters long`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/member/change-password', {
        ...(needsCurrentPassword ? { currentPassword } : {}),
        newPassword,
      });

      const memberResponse = await api.get('/auth/member/me');
      if (memberResponse.data.member) {
        setMember(memberResponse.data.member);
      }

      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      onPasswordChanged();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10001,
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
        <h2>Password Reset Required</h2>
        <p style={{ marginBottom: '20px', color: '#666' }}>
          {needsCurrentPassword
            ? 'Your password must be updated before you can continue.'
            : 'Set a password for your account to continue.'}
        </p>
        <form onSubmit={handleSubmit}>
          {needsCurrentPassword && (
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={minimumPasswordLength}
              autoFocus={!needsCurrentPassword}
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={minimumPasswordLength}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Header({
  onLogout,
  clubName,
  children,
}: {
  onLogout: () => void;
  clubName: string | null;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const systemConfig = useSyncExternalStore(subscribeToSystemConfig, getSystemConfig, getSystemConfig);
  const todayHours = todayHoursHeaderLabel(systemConfig.branding);
  const showAchievementsLink = hasAnyPublicAchievementEnabled(systemConfig);
  const [userName, setUserName] = useState<string>('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [kioskMode, setKioskMode] = useState(() => isKioskMode());
  const [kioskKind, setKioskKind] = useState<KioskKind | undefined>(() => getKioskKind());
  const [kioskTournamentId, setKioskTournamentId] = useState<number | undefined>(() => getKioskTournamentId());
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [pendingPreregistrationCount, setPendingPreregistrationCount] = useState(0);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const autoRelinquishIdleTimerRef = useRef<number | null>(null);
  const autoRelinquishIdleCleanupRef = useRef<(() => void) | null>(null);
  const changesetId = (import.meta.env.VITE_CHANGESET_ID || 'devbuild').slice(0, 7);
  
  const isPlayersActive = location.pathname === '/players';
  const isTournamentsActive = location.pathname === '/tournaments' || location.pathname.startsWith('/tournaments/');
  const isSettingsActive = location.pathname === '/system-settings';
  const isPaymentsActive = location.pathname === '/payments';
  const isAttendanceActive = location.pathname === '/attendance-log';
  const paymentsTab = new URLSearchParams(location.search).get('tab');
  const isPlansActive = isPaymentsActive && paymentsTab === 'plans';
  const isPaymentsListActive = isPaymentsActive && !isPlansActive;
  const isAdminSectionActive = isSettingsActive || isPaymentsActive || isAttendanceActive;
  const adminMenuLabel = isSettingsActive
    ? 'System Configuration'
    : isPlansActive
      ? 'Payment Plans'
      : isAttendanceActive
        ? 'Attendance Log'
        : isPaymentsListActive
          ? 'Payment Log'
          : 'Admin';
  const isAchievementsActive =
    location.pathname === '/public' ||
    location.pathname === '/public/' ||
    location.pathname.startsWith('/public/achievements');

  // Shared sizing for header icon controls ($ ⚙️) so they align uniformly.
  // Vertical padding matches Players/Tournaments tab rhythm (10 / 12).
  const headerIconControlSize: CSSProperties = {
    padding: '10px 12px 12px 12px',
    minWidth: '44px',
    height: '44px',
    fontSize: '16px',
    lineHeight: 1,
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  };
  
  // Format roles as comma-separated first letters
  const formatRoles = (roles: string[]): string => {
    if (!roles || roles.length === 0) return '';
    return roles
      .map(role => role.charAt(0)) // Get first letter
      .join(', '); // Join with comma and space
  };
  
  useEffect(() => {
    const applyMember = (member: {
      firstName?: string;
      lastName?: string;
      roles?: string[];
      kioskMode?: boolean;
      kioskKind?: KioskKind;
      kioskTournamentId?: number;
    }) => {
      setUserName(`${member.firstName || ''} ${member.lastName || ''}`.trim() || 'User');
      setUserRoles(member.roles || []);
      setKioskMode(member.kioskMode === true);
      setKioskKind(
        member.kioskMode === true &&
          (member.kioskKind === 'checkin' ||
            member.kioskKind === 'browse' ||
            member.kioskKind === 'tournamentScore')
          ? member.kioskKind
          : undefined,
      );
      setKioskTournamentId(
        member.kioskMode === true && typeof member.kioskTournamentId === 'number'
          ? member.kioskTournamentId
          : undefined,
      );
    };

    // Fetch current user info
    const fetchUserInfo = async () => {
      try {
        // Try to get member info from session
        const response = await api.get('/auth/member/me');
        if (response.data.member) {
          const member = response.data.member;
          setMember(member);
          applyMember(member);
          return;
        }
      } catch (err) {
        // If member endpoint fails, try to get from localStorage
        const member = getMember();
        if (member) {
          applyMember(member);
          return;
        }
      }
      
      // Fallback: if we have a token but no member, show "User"
      if (getToken()) {
        setUserName('User');
        setUserRoles([]);
        setKioskMode(false);
        setKioskKind(undefined);
        setKioskTournamentId(undefined);
      }
    };
    
    fetchUserInfo();
    const onKioskChanged = () => {
      const member = getMember();
      if (member) applyMember(member);
    };
    window.addEventListener('kiosk-mode-changed', onKioskChanged);
    return () => window.removeEventListener('kiosk-mode-changed', onKioskChanged);
  }, [location.pathname]);

  useEffect(() => {
    if (!kioskMode) return;
    if (kioskKind === 'checkin' && location.pathname !== '/players') {
      navigate('/players', { replace: true });
      return;
    }
    if (kioskKind === 'tournamentScore' && kioskTournamentId != null) {
      const expected = `/tournaments/${kioskTournamentId}`;
      if (location.pathname !== expected) {
        navigate(expected, { replace: true });
      }
    }
  }, [kioskMode, kioskKind, kioskTournamentId, location.pathname, navigate]);

  const clearAutoRelinquishIdleTimer = () => {
    if (autoRelinquishIdleTimerRef.current !== null) {
      window.clearTimeout(autoRelinquishIdleTimerRef.current);
      autoRelinquishIdleTimerRef.current = null;
    }
    if (autoRelinquishIdleCleanupRef.current) {
      autoRelinquishIdleCleanupRef.current();
      autoRelinquishIdleCleanupRef.current = null;
    }
  };

  const handleRelinquish = async (kind?: KioskKind, tournamentId?: number) => {
    clearAutoRelinquishIdleTimer();
    try {
      const resolvedKind = kind ?? defaultKioskKindForRoles(getMember()?.roles || userRoles);
      if (!resolvedKind) {
        window.alert('Unable to determine kiosk mode for this account');
        return;
      }
      const path = await enterKioskMode({
        kind: resolvedKind,
        tournamentId,
      });
      const member = getMember();
      if (member) {
        setKioskMode(member.kioskMode === true);
        setKioskKind(getKioskKind());
        setKioskTournamentId(getKioskTournamentId());
        setUserRoles(member.roles || []);
      }
      navigate(path, { replace: true });
    } catch (err: any) {
      window.alert(err.response?.data?.error || 'Failed to enter kiosk mode');
    }
  };

  const scheduleAutoRelinquishIdle = (memberPayload?: {
    autoRelinquishPrivileges?: boolean;
    autoRelinquishIdleMinutes?: number;
  }) => {
    clearAutoRelinquishIdleTimer();
    const member = memberPayload || getMember();
    const enabled = member?.autoRelinquishPrivileges === true;
    const minutes = Number(
      member?.autoRelinquishIdleMinutes ?? getSystemConfig().authPolicy.autoRelinquishIdleMinutes
    );
    if (!enabled || !Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    const ms = minutes * 60 * 1000;
    const arm = () => {
      if (autoRelinquishIdleTimerRef.current !== null) {
        window.clearTimeout(autoRelinquishIdleTimerRef.current);
      }
      autoRelinquishIdleTimerRef.current = window.setTimeout(() => {
        void handleRelinquish();
      }, ms);
    };
    arm();
    const onActivity = () => arm();
    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    autoRelinquishIdleCleanupRef.current = () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  };

  useEffect(() => {
    return () => {
      clearAutoRelinquishIdleTimer();
    };
  }, []);

  const handleRestore = async () => {
    if (!restorePassword.trim()) {
      setRestoreError('Password is required');
      return;
    }
    setRestoreLoading(true);
    setRestoreError('');
    try {
      const response = await api.post('/auth/member/restore-privileges', {
        password: restorePassword,
      });
      if (response.data.token) {
        setToken(response.data.token);
      }
      const me = await api.get('/auth/member/me');
      if (me.data.member) {
        setMember(me.data.member);
        setKioskMode(false);
        setKioskKind(undefined);
        setKioskTournamentId(undefined);
        setUserRoles(me.data.member.roles || []);
        scheduleAutoRelinquishIdle(me.data.member);
      }
      setShowRestoreModal(false);
      setRestorePassword('');
    } catch (err: any) {
      setRestoreError(err.response?.data?.error || 'Failed to restore privileges');
    } finally {
      setRestoreLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let deadlineTimeout: number | null = null;
    let hasConnectedOnce = false;

    const scheduleDeadlineRefresh = (nextDeadlineAt: unknown) => {
      if (deadlineTimeout !== null) {
        window.clearTimeout(deadlineTimeout);
        deadlineTimeout = null;
      }
      if (typeof nextDeadlineAt !== 'string' || nextDeadlineAt.trim() === '') return;

      const deadlineTime = new Date(nextDeadlineAt).getTime();
      if (!Number.isFinite(deadlineTime)) return;

      const delay = Math.max(0, deadlineTime - Date.now() + 1000);
      deadlineTimeout = window.setTimeout(() => {
        void fetchPendingPreregistrations();
      }, delay);
    };

    const fetchPendingPreregistrations = async () => {
      try {
        const response = await api.get('/tournaments/preregistration/pending-count');
        if (!cancelled) {
          setPendingPreregistrationCount(Number(response.data?.count) || 0);
          scheduleDeadlineRefresh(response.data?.nextDeadlineAt);
        }
      } catch {
        if (!cancelled) {
          setPendingPreregistrationCount(0);
          scheduleDeadlineRefresh(null);
        }
      }
    };

    const onSocketConnect = () => {
      // Skip the first connect — mount fetch covers cold start; refetch only after reconnect.
      if (hasConnectedOnce) {
        void fetchPendingPreregistrations();
      }
      hasConnectedOnce = true;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchPendingPreregistrations();
      }
    };

    void fetchPendingPreregistrations();
    const socket = connectSocket();
    socket?.on('connect', onSocketConnect);
    if (socket?.connected) {
      hasConnectedOnce = true;
    }
    socket?.on('preregistration:changed', fetchPendingPreregistrations);
    window.addEventListener('tournament-preregistration-count-changed', fetchPendingPreregistrations);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (deadlineTimeout !== null) {
        window.clearTimeout(deadlineTimeout);
      }
      socket?.off('connect', onSocketConnect);
      socket?.off('preregistration:changed', fetchPendingPreregistrations);
      window.removeEventListener('tournament-preregistration-count-changed', fetchPendingPreregistrations);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  
  const handlePlayersClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/players', { replace: true });
  };
  
  const handleTournamentsClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const lastId = loadLastTournamentId();
    if (loadShouldRestoreDetail() && lastId != null && Number.isFinite(lastId) && lastId > 0) {
      navigate(`/tournaments/${lastId}`, { replace: true });
      return;
    }
    saveShouldRestoreDetail(false);
    navigate('/tournaments', { replace: true });
  };

  const handleSettingsClick = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setAdminMenuOpen(false);
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/system-settings', { replace: true });
  };

  const handlePaymentsClick = (e?: React.MouseEvent, tab: 'payments' | 'plans' = 'payments') => {
    e?.preventDefault();
    setAdminMenuOpen(false);
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate(tab === 'plans' ? '/payments?tab=plans' : '/payments', { replace: true });
  };

  const handleAttendanceClick = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setAdminMenuOpen(false);
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/attendance-log', { replace: true });
  };

  useEffect(() => {
    if (!adminMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (adminMenuRef.current && target && !adminMenuRef.current.contains(target)) {
        setAdminMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAdminMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [adminMenuOpen]);

  const adminMenuItems = [
    { id: 'payment-log' as const, label: 'Payment Log', active: isPaymentsListActive },
    { id: 'attendance-log' as const, label: 'Attendance Log', active: isAttendanceActive },
    { id: 'separator' as const, label: '', active: false },
    { id: 'plans' as const, label: 'Payment Plans', active: isPlansActive },
    { id: 'settings' as const, label: 'System Configuration', active: isSettingsActive },
  ] as const;
  const adminMenuLongestLabel = adminMenuItems.reduce(
    (longest, item) => (item.label.length > longest.length ? item.label : longest),
    'Admin',
  );
  // Keep trigger + every dropdown option the same width (longest label).
  const adminMenuWidth = `calc(${adminMenuLongestLabel.length + 2}ch + 24px)`;

  const hasPendingPreregistrations = pendingPreregistrationCount > 0;
  const isAdminUser = !kioskMode && isAdmin();
  const showPlayersTab = !kioskMode || kioskKind === 'browse' || kioskKind === 'checkin';
  const showTournamentsTab = !kioskMode || kioskKind === 'browse';
  const kioskBannerText =
    kioskKind === 'checkin'
      ? 'KIOSK MODE — Club check-in / check-out. Find your name, then enter your PIN.'
      : kioskKind === 'tournamentScore'
        ? 'KIOSK MODE — Tournament score entry. Enter match scores with participant PINs.'
        : 'KIOSK MODE — Browse. View players, tournaments, statistics, and history.';
  
  return (
    <>
    <div className="header" style={{
      position: 'sticky',
      top: 0,
      zIndex: 10000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      ...(kioskMode ? { marginBottom: '10px' } : {})
    }}>
      <div
        className="app-header-row"
        style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        width: '100%',
        gap: '15px'
      }}>
        <div
          className="app-header-tabs"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {showPlayersTab && (
          <a 
            className="app-header-tab"
            href="/players" 
            onClick={handlePlayersClick} 
            style={{ 
              ...headerIconControlSize,
              minWidth: 'auto',
              padding: '10px 18px 12px 18px',
              color: isPlayersActive ? '#333' : 'rgba(255, 255, 255, 0.8)', 
              textDecoration: 'none', 
              background: isPlayersActive ? 'white' : 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              border: isPlayersActive ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'all 0.2s', 
              fontWeight: isPlayersActive ? '600' : '500', 
              cursor: 'pointer',
              boxShadow: isPlayersActive ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
            }} 
            onMouseEnter={(e) => {
              if (!isPlayersActive) {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isPlayersActive) {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            Players
          </a>
          )}
          {showTournamentsTab && (
          <a 
            className="app-header-tab"
            href="/tournaments" 
            onClick={handleTournamentsClick} 
            style={{ 
              ...headerIconControlSize,
              minWidth: 'auto',
              padding: '10px 18px 12px 18px',
              color: hasPendingPreregistrations ? '#c0392b' : (isTournamentsActive ? '#333' : 'rgba(255, 255, 255, 0.8)'),
              textDecoration: 'none', 
              background: hasPendingPreregistrations ? '#fdecea' : (isTournamentsActive ? 'white' : 'rgba(255, 255, 255, 0.15)'),
              borderRadius: '8px',
              border: isTournamentsActive ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'all 0.2s', 
              fontWeight: isTournamentsActive ? '600' : '500', 
              cursor: 'pointer',
              boxShadow: isTournamentsActive ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
            }} 
            onMouseEnter={(e) => {
              if (!isTournamentsActive) {
                e.currentTarget.style.color = hasPendingPreregistrations ? '#c0392b' : 'white';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTournamentsActive) {
                e.currentTarget.style.color = hasPendingPreregistrations ? '#c0392b' : 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.background = hasPendingPreregistrations ? '#fdecea' : 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            Tournaments
            {hasPendingPreregistrations ? (
              <span style={{ marginLeft: '6px', fontWeight: 700 }}>
                ({pendingPreregistrationCount})
              </span>
            ) : null}
          </a>
          )}
          {isAdminUser ? (
            <div ref={adminMenuRef} style={{ position: 'relative', marginLeft: '18px' }}>
              <button
                type="button"
                className="app-header-tab"
                aria-haspopup="menu"
                aria-expanded={adminMenuOpen}
                onClick={() => setAdminMenuOpen((open) => !open)}
                style={{
                  ...headerIconControlSize,
                  minWidth: adminMenuWidth,
                  width: adminMenuWidth,
                  padding: '10px 12px 12px 12px',
                  justifyContent: 'space-between',
                  gap: '6px',
                  color: isAdminSectionActive ? '#333' : 'rgba(255, 255, 255, 0.8)',
                  background: isAdminSectionActive ? 'white' : 'rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  border: isAdminSectionActive ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
                  fontWeight: isAdminSectionActive ? '600' : '500',
                  boxShadow: isAdminSectionActive ? '0 2px 4px rgba(0, 0, 0, 0.1)' : 'none',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isAdminSectionActive) {
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isAdminSectionActive) {
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  }
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminMenuLabel}</span>
                <span aria-hidden="true" style={{ fontSize: '12px', flexShrink: 0 }}>
                  ▾
                </span>
              </button>
              {adminMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Admin pages"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    width: adminMenuWidth,
                    minWidth: adminMenuWidth,
                    background: 'white',
                    border: '1px solid rgba(0, 0, 0, 0.12)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)',
                    zIndex: 10050,
                    overflow: 'hidden',
                    padding: '4px 0',
                    boxSizing: 'border-box',
                  }}
                >
                  {adminMenuItems.map((item) => {
                    if (item.id === 'separator') {
                      return (
                        <div
                          key="separator"
                          role="separator"
                          style={{
                            height: '1px',
                            background: '#d8e8f0',
                            margin: '6px 10px',
                          }}
                        />
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (item.id === 'settings') handleSettingsClick();
                          else if (item.id === 'attendance-log') handleAttendanceClick();
                          else if (item.id === 'plans') handlePaymentsClick(undefined, 'plans');
                          else handlePaymentsClick(undefined, 'payments');
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          boxSizing: 'border-box',
                          textAlign: 'left',
                          padding: '10px 14px',
                          border: 'none',
                          background: item.active ? '#eaf4fb' : 'transparent',
                          color: item.active ? '#155b78' : '#17324d',
                          fontWeight: item.active ? 700 : 600,
                          fontSize: '14px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => {
                          if (!item.active) e.currentTarget.style.background = '#f5f8fb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = item.active ? '#eaf4fb' : 'transparent';
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
        <h1
          className="app-header-title"
          style={{
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '10px',
          flex: 1,
        }}>
          <div className="app-header-logo-wrap" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'nowrap', flexShrink: 0 }}>
            <span
              aria-label={`Build ${changesetId}`}
              title={changesetId}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 'calc(100% + 3px)',
                transform: 'translateX(-50%)',
                color: 'rgba(255, 255, 255, 0.45)',
                fontSize: '9px',
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
                lineHeight: 1,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {changesetId}
            </span>
            <span className="app-header-paddle">🏓</span>
            <span
              className="app-header-logo-box"
              style={{
              background: 'linear-gradient(to bottom, #4682B4 0%, #5F9EA0 50%, #4682B4 100%)',
              color: 'white',
              padding: '17px 8px',
              borderRadius: '10px',
              border: '1px solid white',
              position: 'relative',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              width: '170px'
            }}>
              <div style={{ 
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 2
              }}>
                <span
                  className="app-header-logo-text"
                  style={{
                  fontSize: '22px',
                  fontWeight: '600',
                  marginLeft: '15px'
                }}>Spin</span>
              </div>
              <span style={{ 
                position: 'absolute', 
                left: '50%', 
                top: '0',
                bottom: '0',
                transform: 'translateX(-50%)',
                width: '3px',
                background: 'white',
                zIndex: 1
              }}></span>
              <div style={{ 
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 2
              }}>
                <span
                  className="app-header-logo-text"
                  style={{
                  fontSize: '22px',
                  fontWeight: '600',
                  marginLeft: '5px'
                }}>Master</span>
              </div>
            </span>
            <span className="app-header-paddle">🏓</span>
          </div>
          {clubName ? (
            <span
              className="app-header-club"
              style={{
                display: 'block',
                fontSize: '17px',
                fontWeight: 600,
                color: '#B8D9F0',
                textAlign: 'center',
                letterSpacing: '0.02em',
                lineHeight: 1.25,
                maxWidth: '420px',
                margin: '0 auto',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
                whiteSpace: 'nowrap',
              }}
              title={todayHours.comment || undefined}
            >
              {clubName}
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'rgba(184, 217, 240, 0.88)',
                  letterSpacing: '0.01em',
                  marginLeft: '0.35em',
                }}
              >
                ({todayHours.label}
                {todayHours.comment ? ` · ${todayHours.comment}` : ''})
              </span>
            </span>
          ) : null}
        </h1>
        <div className="app-header-user" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <div className="app-header-user-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {userName && (
                <>
                  {!kioskMode && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const member = getMember();
                          if (member) {
                            clearAllScrollPositions();
                            clearAllUIStates();
                            window.scrollTo(0, 0);
                            navigate('/players', {
                              state: { openOwnPlan: true, memberId: member.id },
                              replace: false,
                            });
                          }
                        }}
                        title="View and manage your club plan"
                        aria-label="View and manage your club plan"
                        style={{
                          ...headerIconControlSize,
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                      >
                        $
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const member = getMember();
                          if (member) {
                            clearAllScrollPositions();
                            clearAllUIStates();
                            window.scrollTo(0, 0);
                            navigate('/players', {
                              state: { editOwnProfile: true, memberId: member.id },
                              replace: false,
                            });
                          }
                        }}
                        title="Edit your profile"
                        style={{
                          ...headerIconControlSize,
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                      >
                        ⚙️
                      </button>
                    </div>
                  )}
                  <span style={{
                    ...headerIconControlSize,
                    color: 'white',
                    fontWeight: '500',
                    padding: '10px 12px 12px 12px',
                    minWidth: 'auto',
                    height: '44px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                  }}>
                    {userName}
                    {userRoles.length > 0 && !kioskMode && (
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 'normal',
                        marginLeft: '4px',
                        opacity: 0.9
                      }}>
                        ({formatRoles(userRoles)})
                      </span>
                    )}
                    {kioskMode && (
                      <span style={{ fontSize: '12px', marginLeft: '6px', opacity: 0.95 }}>
                        (Kiosk{kioskKind ? `: ${kioskKind}` : ''})
                      </span>
                    )}
                  </span>
                </>
              )}
              {!kioskMode && (
                <button
                  onClick={onLogout}
                  style={{
                    ...headerIconControlSize,
                    minWidth: 'auto',
                    padding: '10px 16px 12px 16px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  Logout
                </button>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
                alignSelf: 'flex-start',
                gap: '6px',
                minHeight: '18px',
              }}
            >
              {!kioskMode ? <PlayersKioskEntryButton /> : null}
              {showAchievementsLink ? (
                <button
                  type="button"
                  className="app-header-public-link"
                  onClick={() => {
                    window.open('/public', '_blank', 'noopener,noreferrer');
                  }}
                  title="Open public pages in a new tab"
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: isAchievementsActive ? 700 : 500,
                    lineHeight: 1.2,
                    color: isAchievementsActive ? '#fff' : 'rgba(255, 255, 255, 0.75)',
                    background: isAchievementsActive ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Public
                </button>
              ) : null}
              {!kioskMode ? (
                <button
                  type="button"
                  className="app-header-public-link"
                  onClick={() => {
                    window.open('/role-tutorials/index.html', '_blank', 'noopener,noreferrer');
                  }}
                  title="Open role tutorials in a new tab"
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 500,
                    lineHeight: 1.2,
                    color: 'rgba(255, 255, 255, 0.75)',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Tutorials
                </button>
              ) : null}
            </div>
        </div>
      </div>
      {kioskMode && (
        <div
          style={{
            background: '#c0392b',
            color: 'white',
            textAlign: 'center',
            padding: '8px 16px',
            marginTop: '8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: '0.02em',
          }}
        >
          {kioskBannerText}
          <button
            type="button"
            onClick={() => { setShowRestoreModal(true); setRestoreError(''); setRestorePassword(''); }}
            style={{
              marginLeft: '16px',
              padding: '6px 12px',
              border: '1px solid rgba(255,255,255,0.8)',
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Restore privileges
          </button>
        </div>
      )}
    </div>
    {children}
    {showRestoreModal && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 20000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => !restoreLoading && setShowRestoreModal(false)}
      >
        <div
          style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '400px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>Restore privileges</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>
            Enter your password to leave kiosk mode and restore organizer/admin privileges.
          </p>
          {restoreError && (
            <div style={{ color: '#c0392b', marginBottom: '10px', fontSize: '14px' }}>{restoreError}</div>
          )}
          <input
            type="password"
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRestore();
              }
            }}
            placeholder="Password"
            autoFocus
            style={{ width: '100%', padding: '10px', marginBottom: '16px', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={() => setShowRestoreModal(false)} disabled={restoreLoading}>
              Cancel
            </button>
            <button type="button" onClick={handleRestore} disabled={restoreLoading} className="success">
              {restoreLoading ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default App;


