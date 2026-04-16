import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';

type ClubVisitPayload = {
  id: number;
  clubDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  dailyPaymentApplied: boolean;
};

type ScanResponse =
  | {
      action: 'CHECK_IN';
      member: { id: number; firstName: string; lastName: string };
      visit: ClubVisitPayload;
      entitlementWarning: {
        daysRemaining: number;
        label: string | null;
        type: string;
      } | null;
    }
  | {
      action: 'CHECK_OUT';
      member: { id: number; firstName: string; lastName: string };
      visit: ClubVisitPayload;
    }
  | {
      action: 'PAYMENT_REQUIRED';
      member: { id: number; firstName: string; lastName: string };
      needsPayment: true;
      entitlementWarning: {
        daysRemaining: number;
        label: string | null;
        type: string;
      } | null;
    };

export default function ClubCheckinPage({ clubName }: { clubName: string | null }) {
  const [qrToken, setQrToken] = useState('');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tz, setTz] = useState<string | null>(null);
  const [sessionMember, setSessionMember] = useState<{ firstName: string; lastName: string } | null>(null);
  const [selfToday, setSelfToday] = useState<{ clubDate: string; openVisit: ClubVisitPayload | null } | null>(null);
  const [selfLoading, setSelfLoading] = useState(false);

  const refreshSelf = useCallback(async () => {
    try {
      const r = await api.get<{ clubDate: string; openVisit: ClubVisitPayload | null }>('/club/self/today');
      setSelfToday(r.data);
    } catch {
      setSelfToday(null);
    }
  }, []);

  useEffect(() => {
    api
      .get<{ clubTimezone: string }>('/club/public-config')
      .then((r) => setTz(r.data.clubTimezone))
      .catch(() => setTz(null));
    api
      .get('/auth/member/me')
      .then((r) => {
        if (r.data?.member) {
          setSessionMember({
            firstName: r.data.member.firstName,
            lastName: r.data.member.lastName,
          });
          refreshSelf();
        } else {
          setSessionMember(null);
        }
      })
      .catch(() => setSessionMember(null));
  }, [refreshSelf]);

  const submitScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post<ScanResponse>('/club/scan', { qrToken: qrToken.trim() });
      setResult(r.data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Scan failed'));
    } finally {
      setLoading(false);
    }
  };

  const selfToggle = async () => {
    setSelfLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api.post<ScanResponse>('/club/self/toggle');
      setResult(r.data);
      await refreshSelf();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Check-in failed'));
    } finally {
      setSelfLoading(false);
    }
  };

  const title = clubName ? `${clubName} — club check-in` : 'Club check-in';

  return (
    <div style={{ maxWidth: 560, margin: '24px auto', padding: '0 16px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        {tz && (
          <p style={{ color: '#555', fontSize: '14px', marginBottom: '16px' }}>
            Club calendar date uses timezone: <strong>{tz}</strong> (set <code>CLUB_TIMEZONE</code> on the server).
          </p>
        )}

        <form onSubmit={submitScan}>
          <div className="form-group">
            <label htmlFor="qrToken">QR payload (same value as member QR / <code>qrTokenHash</code>)</label>
            <input
              id="qrToken"
              type="text"
              autoComplete="off"
              value={qrToken}
              onChange={(e) => setQrToken(e.target.value)}
              placeholder="Scan or paste (USB scanners often append Enter to submit)"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px', padding: '10px' }}
            />
          </div>
          <button type="submit" disabled={loading || !qrToken.trim()} style={{ marginTop: 8 }}>
            {loading ? 'Submitting…' : 'Submit scan'}
          </button>
        </form>

        {sessionMember && (
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e0e0e0' }}>
            <h2 style={{ fontSize: '18px', marginBottom: 12 }}>Signed in: {sessionMember.firstName} {sessionMember.lastName}</h2>
            <p style={{ color: '#555', fontSize: '14px', marginBottom: 12 }}>
              Manual check-in / check-out (same rules as QR, no code required).
            </p>
            {selfToday && (
              <p style={{ fontSize: '14px', marginBottom: 12 }}>
                Today ({selfToday.clubDate}):{' '}
                {selfToday.openVisit ? (
                  <span style={{ color: '#c06000' }}>Checked in — use toggle to check out.</span>
                ) : (
                  <span style={{ color: '#2a6' }}>Not checked in.</span>
                )}
              </p>
            )}
            <button type="button" onClick={selfToggle} disabled={selfLoading}>
              {selfLoading ? 'Working…' : 'Toggle check-in / check-out'}
            </button>
          </div>
        )}

        {error && (
          <div className="error-message" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20, padding: 12, background: '#f5f9ff', borderRadius: 8, fontSize: '14px' }}>
            <strong>Result:</strong> {result.action}
            {result.action !== 'PAYMENT_REQUIRED' && (
              <div style={{ marginTop: 8 }}>
                {result.member.firstName} {result.member.lastName}
                {result.action === 'CHECK_IN' && result.visit && (
                  <span> — in at {new Date(result.visit.checkedInAt).toLocaleString()}</span>
                )}
                {result.action === 'CHECK_OUT' && result.visit?.checkedOutAt && (
                  <span> — out at {new Date(result.visit.checkedOutAt).toLocaleString()}</span>
                )}
              </div>
            )}
            {result.action === 'PAYMENT_REQUIRED' && (
              <p style={{ marginTop: 8 }}>No active entitlement or per-visit payment recorded for today. Ask staff to record payment or assign a membership.</p>
            )}
            {'entitlementWarning' in result && result.entitlementWarning && (
              <p style={{ marginTop: 8, color: '#a60' }}>
                Reminder: {result.entitlementWarning.type} expires in {result.entitlementWarning.daysRemaining} day(s).
              </p>
            )}
          </div>
        )}

        <p style={{ marginTop: 24, fontSize: '13px', color: '#666' }}>
          USB QR scanners usually act as a keyboard: focus the field above and scan — the token appears as typed text,
          then press Submit or Enter.
        </p>
      </div>
    </div>
  );
}
