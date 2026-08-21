import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAuthenticated, setMember, setToken } from '../../utils/auth';
import { defaultAuthenticatedPath } from '../../utils/meMode';
import { getSystemConfig, loadPublicSystemConfig } from '../../utils/systemConfig';
import { PublicResultsShell } from './PublicResultsShell';

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  fontSize: '16px',
  border: '1px solid #cfd8dc',
  borderRadius: '4px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: '#37474f',
  marginBottom: '6px',
};

const formStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  maxWidth: '420px',
};

function joinApiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; fieldErrors?: Record<string, string> } } })?.response
    ?.data;
  const fieldErrors = data?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const unique = [...new Set(Object.values(fieldErrors).filter((v) => typeof v === 'string' && v.trim()))];
    if (unique.length > 0) return unique.join('. ');
  }
  return getErrorMessage(err, fallback);
}

export function PublicJoinPage() {
  const alreadyMember = isAuthenticated();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void loadPublicSystemConfig();
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/public/membership/apply', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(joinApiError(err, 'Could not submit your application.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicResultsShell>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '12px', color: '#2c3e50' }}>Become a Member</h2>
        {alreadyMember ? (
          <p style={{ margin: 0 }}>
            You are already signed in.{' '}
            <Link to={defaultAuthenticatedPath()}>Continue to the club app</Link>
          </p>
        ) : submitted ? (
          <p style={{ margin: 0 }}>
            Check your email for Accept and Deny links. Those links expire in 7 days.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: '#546e7a' }}>
              Enter your name and email. We will send a confirmation with Accept and Deny options.
            </p>
            <form onSubmit={onSubmit} style={formStackStyle}>
              <div>
                <label htmlFor="join-first-name" style={labelStyle}>
                  First name
                </label>
                <input
                  id="join-first-name"
                  name="firstName"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="join-last-name" style={labelStyle}>
                  Last name
                </label>
                <input
                  id="join-last-name"
                  name="lastName"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="join-email" style={labelStyle}>
                  Email
                </label>
                <input
                  id="join-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              {error ? <p style={{ margin: 0, color: '#c0392b' }}>{error}</p> : null}
              <div>
                <button type="submit" className="button-cta-member" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </PublicResultsShell>
  );
}

export function PublicJoinSetupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [scorePin, setScorePin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minPasswordLength, setMinPasswordLength] = useState(6);
  const [pinLength, setPinLength] = useState(4);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await loadPublicSystemConfig().catch(() => undefined);
      if (!cancelled) {
        const config = getSystemConfig();
        setMinPasswordLength(config.authPolicy.minimumPasswordLength);
        setPinLength(config.authPolicy.pinLength);
      }
      if (!token) {
        if (!cancelled) {
          setPreviewError('This link is missing a token.');
          setLoading(false);
        }
        return;
      }
      try {
        const response = await api.get('/public/membership/token', { params: { token } });
        if (!cancelled) {
          setFirstName(typeof response.data?.firstName === 'string' ? response.data.firstName : '');
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(joinApiError(err, 'This link is invalid or has expired.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < minPasswordLength) {
      setError(`Password must be at least ${minPasswordLength} characters long`);
      return;
    }
    if (!/^\d+$/.test(scorePin) || scorePin.length !== pinLength) {
      setError(`PIN must be exactly ${pinLength} digits`);
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post('/public/membership/complete', {
        token,
        password,
        scorePin,
      });
      if (response.data?.member) {
        setMember(response.data.member);
        if (response.data.token) {
          setToken(response.data.token);
        }
        window.location.assign(defaultAuthenticatedPath(response.data.member));
        return;
      }
      setError('Account was created but sign-in failed. Please log in.');
    } catch (err) {
      setError(joinApiError(err, 'Could not complete membership setup.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicResultsShell>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '12px', color: '#2c3e50' }}>Accept membership</h2>
        {loading ? (
          <p style={{ margin: 0 }}>Loading…</p>
        ) : previewError ? (
          <p style={{ margin: 0, color: '#c0392b' }}>{previewError}</p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: '#546e7a' }}>
              {firstName ? `Hi ${firstName}. ` : ''}Set a password and a {pinLength}-digit score PIN to activate your
              membership and start your trial.
            </p>
            <form onSubmit={onSubmit} style={formStackStyle}>
              <div>
                <label htmlFor="join-password" style={labelStyle}>
                  Password
                </label>
                <input
                  id="join-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={minPasswordLength}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="join-password-confirm" style={labelStyle}>
                  Confirm password
                </label>
                <input
                  id="join-password-confirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={minPasswordLength}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="join-pin" style={labelStyle}>
                  Score PIN ({pinLength} digits)
                </label>
                <input
                  id="join-pin"
                  name="scorePin"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  maxLength={pinLength}
                  value={scorePin}
                  onChange={(e) => setScorePin(e.target.value.replace(/\D/g, '').slice(0, pinLength))}
                  style={fieldStyle}
                />
              </div>
              {error ? <p style={{ margin: 0, color: '#c0392b' }}>{error}</p> : null}
              <div>
                <button type="submit" className="button-cta-member" disabled={submitting}>
                  {submitting ? 'Activating…' : 'Activate and sign in'}
                </button>
              </div>
            </form>
            <p style={{ marginBottom: 0, marginTop: '20px', color: '#546e7a', fontSize: '14px' }}>
              After you sign in you can add phone, address, photo, birth date, and tournament notification
              preferences.
            </p>
          </>
        )}
      </div>
    </PublicResultsShell>
  );
}

export function PublicJoinDenyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        setPreviewError('This link is missing a token.');
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/public/membership/token', { params: { token } });
        if (!cancelled) {
          setFirstName(typeof response.data?.firstName === 'string' ? response.data.firstName : '');
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(joinApiError(err, 'This link is invalid or has expired.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/public/membership/deny', { token });
      setDone(true);
    } catch (err) {
      setError(joinApiError(err, 'Could not cancel this application.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicResultsShell>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '12px', color: '#2c3e50' }}>Deny membership</h2>
        {loading ? (
          <p style={{ margin: 0 }}>Loading…</p>
        ) : previewError ? (
          <p style={{ margin: 0, color: '#c0392b' }}>{previewError}</p>
        ) : done ? (
          <p style={{ margin: 0 }}>Your application has been cancelled.</p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: '#546e7a' }}>
              {firstName ? `Hi ${firstName}. ` : ''}This will remove your pending membership application. This cannot
              be undone from this page.
            </p>
            {error ? <p style={{ color: '#c0392b' }}>{error}</p> : null}
            <button type="button" className="danger" disabled={submitting} onClick={() => void onConfirm()}>
              {submitting ? 'Cancelling…' : 'Cancel application'}
            </button>
          </>
        )}
      </div>
    </PublicResultsShell>
  );
}
