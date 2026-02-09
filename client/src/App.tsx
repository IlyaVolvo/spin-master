import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import { getToken, setToken, removeToken, getMember, removeMember, setMember, isAuthenticated } from './utils/auth';
import api from './utils/api';
import { clearAllScrollPositions, clearAllUIStates } from './utils/scrollPosition';
import { getErrorMessage } from './utils/errorHandler';

// Lazy load route components for code splitting
const Players = lazy(() => import('./components/Players'));
const Tournaments = lazy(() => import('./components/Tournaments'));
const Statistics = lazy(() => import('./components/Statistics'));
const History = lazy(() => import('./components/History'));

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

// Component to handle navigation to /players on initial auth
function AuthRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    // If we're at root or any non-matching path, navigate to /players
    const validPaths = ['/players', '/tournaments', '/statistics', '/history'];
    if (!validPaths.includes(location.pathname)) {
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

  useEffect(() => {
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
            removeMember();
            removeToken();
            setIsAuth(false);
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

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <ScrollToTop />
      {!isAuth ? (
        <ErrorBoundary>
        <Login onLogin={handleLogin} />
        </ErrorBoundary>
      ) : (
        <>
          <AuthRedirect />
          <div className="container">
            <Header onLogout={handleLogout} />
            <ErrorBoundary>
            <Suspense fallback={
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: '18px' }}>
                Loading...
              </div>
            }>
              <Routes>
                <Route path="/" element={<Navigate to="/players" replace />} />
                <Route path="/players" element={<Players />} />
                <Route path="/tournaments" element={<Tournaments />} />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/history" element={<History />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
          
          {/* Password Reset Modal - shown when mustResetPassword is true */}
          {showPasswordReset && (
            <PasswordResetModal
              onPasswordChanged={async () => {
                // Refresh member data
                try {
                  const response = await api.get('/auth/member/me');
                  if (response.data.member) {
                    setMember(response.data.member);
                    setShowPasswordReset(false);
                  }
                } catch (err) {
                  // Error refreshing, but password was changed
                  setShowPasswordReset(false);
                }
              }}
            />
          )}
        </>
      )}
    </Router>
  );
}

// Password Reset Modal Component
function PasswordResetModal({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      await api.post('/auth/member/change-password', {
        currentPassword,
        newPassword,
      });
      
      // Refresh member data
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
          Your password has been reset by an administrator. Please set a new password to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
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

function Header({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState<string>('');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  
  const isPlayersActive = location.pathname === '/players';
  const isTournamentsActive = location.pathname === '/tournaments';
  
  // Format roles as comma-separated first letters
  const formatRoles = (roles: string[]): string => {
    if (!roles || roles.length === 0) return '';
    return roles
      .map(role => role.charAt(0)) // Get first letter
      .join(', '); // Join with comma and space
  };
  
  useEffect(() => {
    // Fetch current user info
    const fetchUserInfo = async () => {
      try {
        // Try to get member info from session
        const response = await api.get('/auth/member/me');
        if (response.data.member) {
          const member = response.data.member;
          setUserName(`${member.firstName} ${member.lastName}`);
          setUserRoles(member.roles || []);
          return;
        }
      } catch (err) {
        // If member endpoint fails, try to get from localStorage
        const member = getMember();
        if (member) {
          setUserName(`${member.firstName} ${member.lastName}`);
          setUserRoles(member.roles || []);
          return;
        }
      }
      
      // Fallback: if we have a token but no member, show "User"
      if (getToken()) {
        setUserName('User');
        setUserRoles([]);
      }
    };
    
    fetchUserInfo();
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
    clearAllScrollPositions();
    clearAllUIStates();
    window.scrollTo(0, 0);
    navigate('/tournaments', { replace: true });
  };
  
  return (
    <div className="header" style={{
      position: 'sticky',
      top: 0,
      zIndex: 10000,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', marginBottom: '-1px' }}>
          <a 
            href="/players" 
            onClick={handlePlayersClick} 
            style={{ 
              color: isPlayersActive ? '#333' : 'rgba(255, 255, 255, 0.8)', 
              textDecoration: 'none', 
              padding: '10px 24px 12px 24px', 
              background: isPlayersActive ? 'white' : 'rgba(255, 255, 255, 0.15)',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              border: isPlayersActive ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderBottom: isPlayersActive ? '1px solid white' : '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'all 0.2s', 
              fontSize: '16px', 
              fontWeight: isPlayersActive ? '600' : '500', 
              cursor: 'pointer',
              position: 'relative',
              zIndex: isPlayersActive ? 10 : 1,
              boxShadow: isPlayersActive ? '0 -2px 4px rgba(0, 0, 0, 0.1)' : 'none',
              marginBottom: isPlayersActive ? '0' : '1px'
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
          <a 
            href="/tournaments" 
            onClick={handleTournamentsClick} 
            style={{ 
              color: isTournamentsActive ? '#333' : 'rgba(255, 255, 255, 0.8)', 
              textDecoration: 'none', 
              padding: '10px 24px 12px 24px', 
              background: isTournamentsActive ? 'white' : 'rgba(255, 255, 255, 0.15)',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              border: isTournamentsActive ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderBottom: isTournamentsActive ? '1px solid white' : '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'all 0.2s', 
              fontSize: '16px', 
              fontWeight: isTournamentsActive ? '600' : '500', 
              cursor: 'pointer',
              position: 'relative',
              zIndex: isTournamentsActive ? 10 : 1,
              boxShadow: isTournamentsActive ? '0 -2px 4px rgba(0, 0, 0, 0.1)' : 'none',
              marginBottom: isTournamentsActive ? '0' : '1px'
            }} 
            onMouseEnter={(e) => {
              if (!isTournamentsActive) {
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isTournamentsActive) {
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            Tournaments
          </a>
        </div>
        <h1 style={{ 
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          flex: 1
        }}>
          <span>🏓</span>
          <span style={{ 
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
              <span style={{ 
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
              <span style={{ 
                fontSize: '22px',
                fontWeight: '600',
                marginLeft: '5px'
              }}>Master</span>
            </div>
          </span>
          <span>🏓</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {userName && (
            <>
              <button
                onClick={() => {
                  const member = getMember();
                  if (member) {
                    clearAllScrollPositions();
                    clearAllUIStates();
                    window.scrollTo(0, 0);
                    navigate('/players', { 
                      state: { editOwnProfile: true, memberId: member.id },
                      replace: false 
                    });
                  }
                }}
                title="Edit your profile"
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
              >
                ⚙️
              </button>
            <span style={{ 
              color: 'white',
              fontSize: '16px',
              fontWeight: '500',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px'
            }}>
              {userName}
                {userRoles.length > 0 && (
                  <span style={{ 
                    fontSize: '12px',
                    fontWeight: 'normal',
                    marginLeft: '4px',
                    opacity: 0.9
                  }}>
                    ({formatRoles(userRoles)})
                  </span>
                )}
            </span>
            </>
          )}
          <button onClick={onLogout} style={{ 
            padding: '8px 16px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;


