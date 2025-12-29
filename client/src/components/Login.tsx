import React, { useState } from 'react';
import api from '../utils/api';
import { setMember, setToken } from '../utils/auth';
import { getErrorMessage } from '../utils/errorHandler';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordToken, setResetPasswordToken] = useState('');
  const [resetPasswordNew, setResetPasswordNew] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Member login (email/password) - Session-based
      const response = await api.post('/auth/member/login', { email, password });
      
      console.log('Login response:', {
        hasMember: !!response.data.member,
        hasToken: !!response.data.token,
        tokenLength: response.data.token?.length || 0,
        tokenValue: response.data.token || 'NO TOKEN',
        member: response.data.member,
      });
      
      if (response.data.member) {
        setMember(response.data.member);
        // Also store token for backward compatibility if provided
        if (response.data.token) {
          console.log('Storing token in localStorage:', response.data.token.substring(0, 20) + '...');
          setToken(response.data.token);
          console.log('Token stored. Verifying:', localStorage.getItem('pingpong_token') ? 'SUCCESS' : 'FAILED');
        } else {
          console.warn('No token in login response!');
        }
        
        // Check if password reset is required
        if (response.data.member.mustResetPassword) {
          setShowPasswordChange(true);
          setLoading(false);
          // Don't navigate yet - user must change password first
        } else {
          setLoading(false);
          // Call onLogin to update auth state - this will cause App to re-render and show main app
          // Don't navigate here - let the App component handle routing
          onLogin();
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    
    if (!newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }
    
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    
    setChangingPassword(true);
    
    try {
      // If password was reset by admin (empty), don't send currentPassword
      const changePasswordData: { newPassword: string; currentPassword?: string } = {
        newPassword,
      };
      // Only include currentPassword if we have one (not an admin reset scenario)
      // The backend will handle empty password case
      if (password) {
        changePasswordData.currentPassword = password;
      }
      
      await api.post('/auth/member/change-password', changePasswordData);
      
      // Refresh member data to get updated mustResetPassword flag
      const memberResponse = await api.get('/auth/member/me');
      if (memberResponse.data.member) {
        setMember(memberResponse.data.member);
      }
      
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      // Call onLogin to update auth state - this will cause App to re-render and show main app
      // Don't navigate here - let the App component handle routing
      onLogin();
    } catch (err: any) {
      setPasswordError(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="login-container">
      <div className="card">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#2196F3',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px',
                padding: 0
              }}
            >
              Forgot Password?
            </button>
          </div>
        </form>
      </div>
      
      {/* Password Change Modal - shown when mustResetPassword is true */}
      {showPasswordChange && (
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
          zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
            <h2>Password Reset Required</h2>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              Your password has been reset by an administrator. Please set a new password to continue.
            </p>
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
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
              {passwordError && <div className="error-message">{passwordError}</div>}
              <button type="submit" disabled={changingPassword} style={{ width: '100%' }}>
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && !showResetPassword && (
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
          zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
            <h2>Forgot Password</h2>
            {forgotPasswordSuccess ? (
              <div>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                  If an account with that email exists, a password reset token has been generated.
                </p>
                {resetToken && (
                  <div style={{ 
                    padding: '12px', 
                    background: '#e7f3ff', 
                    border: '1px solid #2196F3', 
                    borderRadius: '4px', 
                    marginBottom: '20px',
                    fontSize: '12px'
                  }}>
                    <strong>Development Mode:</strong> Your reset token is: <code style={{ 
                      display: 'block', 
                      marginTop: '8px', 
                      padding: '8px', 
                      background: '#fff', 
                      borderRadius: '4px',
                      wordBreak: 'break-all'
                    }}>{resetToken}</code>
                    <p style={{ marginTop: '12px', marginBottom: 0 }}>
                      Click "Reset Password" below to proceed with password reset.
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      if (resetToken) {
                        setShowResetPassword(true);
                        setResetPasswordEmail(forgotPasswordEmail);
                        setResetPasswordToken(resetToken);
                      } else {
                        setShowForgotPassword(false);
                        setForgotPasswordEmail('');
                        setResetToken('');
                        setForgotPasswordSuccess(false);
                      }
                    }}
                    style={{ flex: 1, padding: '10px' }}
                  >
                    {resetToken ? 'Reset Password' : 'Close'}
                  </button>
                  {resetToken && (
                    <button
                      onClick={() => {
                        setShowForgotPassword(false);
                        setForgotPasswordEmail('');
                        setResetToken('');
                        setForgotPasswordSuccess(false);
                      }}
                      style={{ padding: '10px' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                  Enter your email address and we'll send you a password reset token.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setForgotPasswordLoading(true);
                  setError('');
                  try {
                    const response = await api.post('/auth/member/forgot-password', { email: forgotPasswordEmail });
                    setForgotPasswordSuccess(true);
                    if (response.data.resetToken) {
                      setResetToken(response.data.resetToken);
                    }
                  } catch (err: any) {
                    // Even on error, show success to prevent email enumeration
                    setForgotPasswordSuccess(true);
                  } finally {
                    setForgotPasswordLoading(false);
                  }
                }}>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" disabled={forgotPasswordLoading} style={{ flex: 1 }}>
                      {forgotPasswordLoading ? 'Sending...' : 'Send Reset Token'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setForgotPasswordEmail('');
                        setError('');
                      }}
                      style={{ padding: '10px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reset Password with Token Modal */}
      {showResetPassword && (
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
          zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '90%', position: 'relative' }}>
            <h2>Reset Password</h2>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              Enter your email, reset token, and new password.
            </p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setResetPasswordError('');
              
              if (!resetPasswordNew || !resetPasswordConfirm) {
                setResetPasswordError('All fields are required');
                return;
              }
              
              if (resetPasswordNew.length < 6) {
                setResetPasswordError('New password must be at least 6 characters long');
                return;
              }
              
              if (resetPasswordNew !== resetPasswordConfirm) {
                setResetPasswordError('New password and confirmation do not match');
                return;
              }
              
              setResettingPassword(true);
              
              try {
                await api.post('/auth/member/reset-password-with-token', {
                  email: resetPasswordEmail,
                  token: resetPasswordToken,
                  newPassword: resetPasswordNew,
                });
                
                // Success - close modal and show success message
                setShowResetPassword(false);
                setShowForgotPassword(false);
                setResetPasswordEmail('');
                setResetPasswordToken('');
                setResetPasswordNew('');
                setResetPasswordConfirm('');
                setForgotPasswordEmail('');
                setResetToken('');
                setForgotPasswordSuccess(false);
                setError('');
                // Show success message in the login form
                alert('Password has been reset successfully. You can now login with your new password.');
              } catch (err: any) {
                setResetPasswordError(getErrorMessage(err, 'Failed to reset password'));
              } finally {
                setResettingPassword(false);
              }
            }}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={resetPasswordEmail}
                  onChange={(e) => setResetPasswordEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Reset Token</label>
                <input
                  type="text"
                  value={resetPasswordToken}
                  onChange={(e) => setResetPasswordToken(e.target.value)}
                  required
                  placeholder="Enter the reset token you received"
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={resetPasswordNew}
                  onChange={(e) => setResetPasswordNew(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {resetPasswordError && <div className="error-message">{resetPasswordError}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={resettingPassword} style={{ flex: 1 }}>
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(false);
                    setResetPasswordEmail('');
                    setResetPasswordToken('');
                    setResetPasswordNew('');
                    setResetPasswordConfirm('');
                    setResetPasswordError('');
                  }}
                  style={{ padding: '10px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;





