import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

interface ToggleResult {
  action: 'CHECK_IN' | 'CHECK_OUT' | 'PAYMENT_REQUIRED';
  visit?: { id: number; checkInAt: string; checkOutAt: string | null; clubDate: string };
  warning?: string | null;
  message?: string;
  member?: { firstName: string; lastName: string };
}

export default function ClubCheckin() {
  const [qrToken, setQrToken] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [clubTimezone, setClubTimezone] = useState('UTC');
  const qrInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Code-based check-in state
  const [codeMode, setCodeMode] = useState(false);
  const [checkinCode, setCheckinCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeSending, setCodeSending] = useState(false);

  // Fetch public config
  useEffect(() => {
    api.get('/club/public-config')
      .then(res => setClubTimezone(res.data.clubTimezone))
      .catch(() => {});
  }, []);

  // Handle QR scan input (kiosk mode)
  const handleScan = async () => {
    if (!qrToken.trim()) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await api.post('/club/scan', { qrToken: qrToken.trim() });
      const data = res.data as ToggleResult;
      const name = data.member ? `${data.member.firstName} ${data.member.lastName}` : '';

      if (data.action === 'CHECK_IN') {
        setFeedback({ type: 'success', message: `${name} checked in.${data.warning ? ' ⚠️ ' + data.warning : ''}` });
      } else if (data.action === 'CHECK_OUT') {
        setFeedback({ type: 'info', message: `${name} checked out.` });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const errorData = err?.response?.data;
      if (status === 402) {
        setFeedback({ type: 'error', message: errorData?.message || 'Payment required' });
      } else if (status === 404) {
        setFeedback({ type: 'error', message: 'Member not found. Check QR code.' });
      } else if (status === 403) {
        setFeedback({ type: 'error', message: errorData?.error || 'Access denied.' });
      } else {
        setFeedback({ type: 'error', message: errorData?.error || 'An error occurred.' });
      }
    } finally {
      setLoading(false);
      setQrToken('');
      qrInputRef.current?.focus();
    }
  };

  // Handle credential-based check-in/out
  const handleLoginToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await api.post('/club/login-toggle', {
        email: loginEmail.trim(),
        password: loginPassword,
      });
      const data = res.data as ToggleResult;
      const name = data.member ? `${data.member.firstName} ${data.member.lastName}` : '';

      if (data.action === 'CHECK_IN') {
        setFeedback({ type: 'success', message: `${name} checked in.${data.warning ? ' ⚠️ ' + data.warning : ''}` });
      } else if (data.action === 'CHECK_OUT') {
        setFeedback({ type: 'info', message: `${name} checked out.` });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const errorData = err?.response?.data;
      if (status === 401) {
        setFeedback({ type: 'error', message: 'Invalid email or password.' });
      } else if (status === 402) {
        setFeedback({ type: 'error', message: errorData?.message || 'Payment required. Please contact staff.' });
      } else if (status === 403) {
        setFeedback({ type: 'error', message: errorData?.error || 'Account inactive.' });
      } else {
        setFeedback({ type: 'error', message: errorData?.error || 'An error occurred.' });
      }
    } finally {
      setLoading(false);
      setLoginPassword('');
      emailInputRef.current?.focus();
    }
  };

  // Request one-time code
  const handleRequestCode = async () => {
    if (!loginEmail.trim()) return;
    setCodeSending(true);
    setFeedback(null);

    try {
      await api.post('/club/request-checkin-code', { email: loginEmail.trim() });
      setCodeSent(true);
      setCodeMode(true);
      setFeedback({ type: 'info', message: 'A check-in code has been sent to your email.' });
    } catch (err: any) {
      const errorData = err?.response?.data;
      setFeedback({ type: 'error', message: errorData?.error || 'Failed to send code.' });
    } finally {
      setCodeSending(false);
    }
  };

  // Submit one-time code for check-in
  const handleCodeToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !checkinCode.trim()) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await api.post('/club/code-toggle', {
        email: loginEmail.trim(),
        code: checkinCode.trim(),
      });
      const data = res.data as ToggleResult;
      const name = data.member ? `${data.member.firstName} ${data.member.lastName}` : '';

      if (data.action === 'CHECK_IN') {
        setFeedback({ type: 'success', message: `${name} checked in.${data.warning ? ' ⚠️ ' + data.warning : ''}` });
      } else if (data.action === 'CHECK_OUT') {
        setFeedback({ type: 'info', message: `${name} checked out.` });
      }
      // Reset code mode after success
      setCodeMode(false);
      setCodeSent(false);
      setCheckinCode('');
    } catch (err: any) {
      const status = err?.response?.status;
      const errorData = err?.response?.data;
      if (status === 401) {
        setFeedback({ type: 'error', message: errorData?.error || 'Invalid code.' });
      } else if (status === 402) {
        setFeedback({ type: 'error', message: errorData?.message || 'Payment required. Please contact staff.' });
      } else if (status === 403) {
        setFeedback({ type: 'error', message: errorData?.error || 'Account inactive.' });
      } else {
        setFeedback({ type: 'error', message: errorData?.error || 'An error occurred.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const feedbackStyles: Record<string, React.CSSProperties> = {
    success: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' },
    error: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },
    warning: { backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba' },
    info: { backgroundColor: '#d1ecf1', color: '#0c5460', border: '1px solid #bee5eb' },
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '10px' }}>Club Check-in</h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px', fontSize: '14px' }}>
        Timezone: {clubTimezone}
      </p>

      {/* Feedback banner */}
      {feedback && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '20px',
          fontSize: '15px',
          ...feedbackStyles[feedback.type],
        }}>
          {feedback.message}
        </div>
      )}

      {/* QR Scan Input (always visible — kiosk mode) */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px' }}>QR Scan</h3>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '12px' }}>
          Scan your member QR code or paste the token below.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={qrInputRef}
            type="text"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            placeholder="QR token..."
            style={{ flex: 1, padding: '10px 12px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' }}
            autoFocus
            disabled={loading}
          />
          <button
            onClick={handleScan}
            disabled={loading || !qrToken.trim()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#2980b9',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '...' : 'Scan'}
          </button>
        </div>
      </div>

      {/* Username/Password check-in */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Login Check-in / Check-out</h3>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '12px' }}>
          Enter your credentials to check in or out.
        </p>

        {!codeMode ? (
          <form onSubmit={handleLoginToggle}>
            <div style={{ marginBottom: '10px' }}>
              <input
                ref={emailInputRef}
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Email"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                disabled={loading}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !loginEmail.trim() || !loginPassword}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '18px',
                fontWeight: '600',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (loading || !loginEmail.trim() || !loginPassword) ? 0.6 : 1,
                transition: 'background-color 0.2s',
              }}
            >
              {loading ? 'Processing...' : 'Check In / Out'}
            </button>
            {/* Forgot password link — only shows when email is entered */}
            {loginEmail.trim() && (
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={codeSending}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2980b9',
                    fontSize: '14px',
                    cursor: codeSending ? 'not-allowed' : 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  {codeSending ? 'Sending code...' : 'Forgot password? Get a one-time code'}
                </button>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleCodeToggle}>
            <div style={{ marginBottom: '10px' }}>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Email"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                disabled={loading}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                inputMode="numeric"
                value={checkinCode}
                onChange={(e) => setCheckinCode(e.target.value)}
                placeholder="6-digit code from email"
                maxLength={6}
                style={{ width: '100%', padding: '10px 12px', fontSize: '20px', letterSpacing: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                disabled={loading}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !loginEmail.trim() || !checkinCode.trim()}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '18px',
                fontWeight: '600',
                backgroundColor: '#8e44ad',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (loading || !loginEmail.trim() || !checkinCode.trim()) ? 0.6 : 1,
                transition: 'background-color 0.2s',
              }}
            >
              {loading ? 'Processing...' : 'Check In with Code'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => { setCodeMode(false); setCodeSent(false); setCheckinCode(''); setFeedback(null); }}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Back to password login
              </button>
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={codeSending || !loginEmail.trim()}
                style={{ background: 'none', border: 'none', color: '#2980b9', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                {codeSending ? 'Sending...' : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
