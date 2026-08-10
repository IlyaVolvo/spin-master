import { FormEvent, useEffect, useState, type CSSProperties } from 'react';
import api from '../../utils/api';
import { getMember, setMember } from '../../utils/auth';
import { getErrorMessage } from '../../utils/errorHandler';
import { getSystemConfig, subscribeToSystemConfig } from '../../utils/systemConfig';
import { isValidEmailFormat, isValidPhoneNumber } from '../../../../server/src/utils/memberValidation';

type MeSettingsOverlayProps = {
  onClose: () => void;
};

/**
 * Phone-hub self profile: contact fields, notifications, password.
 * Avoids loading the full Players edit UI.
 */
export function MeSettingsOverlay({ onClose }: MeSettingsOverlayProps) {
  const self = getMember();
  const [email, setEmail] = useState(self?.email || '');
  const [phone, setPhone] = useState('');
  const [tournamentNotificationsEnabled, setTournamentNotificationsEnabled] = useState(
    Boolean(self?.tournamentNotificationsEnabled && self?.email),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [needsCurrentPassword, setNeedsCurrentPassword] = useState(self?.hasPassword !== false);
  const [minimumPasswordLength, setMinimumPasswordLength] = useState(
    () => getSystemConfig().authPolicy.minimumPasswordLength,
  );
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToSystemConfig((config) => {
      setMinimumPasswordLength(config.authPolicy.minimumPasswordLength);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const member = getMember();
      if (!member) {
        setError('Not signed in');
        setLoading(false);
        return;
      }
      try {
        const [profileRes, meRes] = await Promise.all([
          api.get(`/players/${member.id}`),
          api.get('/auth/member/me'),
        ]);
        if (cancelled) return;
        const p = profileRes.data?.member || profileRes.data;
        setEmail(typeof p?.email === 'string' ? p.email : member.email || '');
        setPhone(typeof p?.phone === 'string' ? p.phone : '');
        setTournamentNotificationsEnabled(
          Boolean(p?.tournamentNotificationsEnabled && (p?.email || member.email)),
        );
        const hp = meRes.data?.member?.hasPassword;
        if (typeof hp === 'boolean') setNeedsCurrentPassword(hp);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load profile'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const member = getMember();
    if (!member) return;
    setError('');
    setMessage('');

    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    if (trimmedEmail && !isValidEmailFormat(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (trimmedPhone && !isValidPhoneNumber(trimmedPhone)) {
      setError('Please enter a valid US phone number');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/players/${member.id}`, {
        email: trimmedEmail === '' ? null : trimmedEmail,
        phone: trimmedPhone || null,
        tournamentNotificationsEnabled: Boolean(trimmedEmail && tournamentNotificationsEnabled),
      });
      const meRes = await api.get('/auth/member/me');
      if (meRes.data?.member) {
        setMember(meRes.data.member);
      }
      setMessage('Profile saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save profile'));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

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

    setPasswordBusy(true);
    try {
      await api.post('/auth/member/change-password', {
        ...(needsCurrentPassword ? { currentPassword } : {}),
        newPassword,
      });
      const meRes = await api.get('/auth/member/me');
      if (meRes.data?.member) {
        setMember(meRes.data.member);
        setNeedsCurrentPassword(true);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setPasswordBusy(false);
    }
  };

  const fieldStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    fontSize: '16px',
    borderRadius: '10px',
    border: '1px solid #cfd8e3',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1f3b57',
    marginBottom: '6px',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        background: 'rgba(15, 23, 32, 0.45)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 'max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#fff',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #e8eef4',
            background: '#1f3b57',
            color: '#fff',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <p style={{ margin: 0, color: '#666' }}>Loading…</p>
          ) : (
            <>
              {error ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: '12px',
                    padding: '10px 12px',
                    background: '#fdecea',
                    color: '#c0392b',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  {error}
                </div>
              ) : null}
              {message ? (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '10px 12px',
                    background: '#eafaf1',
                    color: '#1e8449',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                >
                  {message}
                </div>
              ) : null}

              <form onSubmit={(e) => void saveProfile(e)}>
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="me-settings-email" style={labelStyle}>
                    Email
                  </label>
                  <input
                    id="me-settings-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={fieldStyle}
                    disabled={saving}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="me-settings-phone" style={labelStyle}>
                    Phone
                  </label>
                  <input
                    id="me-settings-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={fieldStyle}
                    disabled={saving}
                  />
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '16px',
                    fontSize: '15px',
                    color: email.trim() ? '#1f3b57' : '#95a5a6',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={tournamentNotificationsEnabled && Boolean(email.trim())}
                    disabled={saving || !email.trim()}
                    onChange={(e) => setTournamentNotificationsEnabled(e.target.checked)}
                  />
                  Tournament email notifications
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '14px',
                    border: 'none',
                    borderRadius: '12px',
                    background: '#2e86de',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
              </form>

              <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e8eef4' }} />

              <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: '#1f3b57' }}>Change password</h3>
              <form onSubmit={(e) => void changePassword(e)}>
                {needsCurrentPassword ? (
                  <div style={{ marginBottom: '14px' }}>
                    <label htmlFor="me-settings-current-password" style={labelStyle}>
                      Current password
                    </label>
                    <input
                      id="me-settings-current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      style={fieldStyle}
                      disabled={passwordBusy}
                    />
                  </div>
                ) : null}
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="me-settings-new-password" style={labelStyle}>
                    New password
                  </label>
                  <input
                    id="me-settings-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={fieldStyle}
                    disabled={passwordBusy}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="me-settings-confirm-password" style={labelStyle}>
                    Confirm new password
                  </label>
                  <input
                    id="me-settings-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={fieldStyle}
                    disabled={passwordBusy}
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordBusy}
                  style={{
                    width: '100%',
                    padding: '14px',
                    border: '1px solid #1f3b57',
                    borderRadius: '12px',
                    background: '#fff',
                    color: '#1f3b57',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: passwordBusy ? 'wait' : 'pointer',
                  }}
                >
                  {passwordBusy ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MeSettingsOverlay;
