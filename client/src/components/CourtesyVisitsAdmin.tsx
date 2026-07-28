import { useEffect, useState } from 'react';
import api from '../utils/api';
import { formatPlayerName } from '../utils/nameFormatter';
import { getErrorMessage } from '../utils/errorHandler';

type CourtesyVisitRow = {
  id: number;
  clubDate: string;
  checkInAt: string;
  member: {
    id: number;
    firstName: string;
    lastName: string;
    email: string | null;
    courtesySuspended: boolean;
  };
};

export function CourtesyVisitsAdmin() {
  const [visits, setVisits] = useState<CourtesyVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/club/admin/courtesy-visits');
      setVisits(Array.isArray(res.data?.visits) ? res.data.visits : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load courtesy visits'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setSuspended = async (memberId: number, suspended: boolean) => {
    setBusyId(memberId);
    try {
      await api.post(`/club/admin/members/${memberId}/courtesy-suspend`, { suspended });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update courtesy status'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div style={{ color: '#666' }}>Loading courtesy visits…</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div>
      <p style={{ margin: '0 0 10px', color: '#666', fontSize: '13px' }}>
        Uncleared courtesy check-ins. Suspend blocks further courtesy until payment or resume.
      </p>
      <button type="button" onClick={() => void load()} style={{ marginBottom: '10px' }}>
        Refresh
      </button>
      {visits.length === 0 ? (
        <div style={{ color: '#666' }}>No pending courtesy visits.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #ddd' }}>Member</th>
              <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #ddd' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #ddd' }}>Check-in</th>
              <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #ddd' }}>Courtesy</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>
                  {formatPlayerName(v.member.firstName, v.member.lastName)}
                  {v.member.email ? (
                    <span style={{ color: '#888', fontSize: '12px' }}> ({v.member.email})</span>
                  ) : null}
                </td>
                <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>{v.clubDate}</td>
                <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>
                  {new Date(v.checkInAt).toLocaleString()}
                </td>
                <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>
                  <button
                    type="button"
                    disabled={busyId === v.member.id}
                    onClick={() => void setSuspended(v.member.id, !v.member.courtesySuspended)}
                  >
                    {v.member.courtesySuspended ? 'Resume' : 'Suspend'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
