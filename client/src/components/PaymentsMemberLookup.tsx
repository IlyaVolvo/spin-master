import { useEffect, useRef, useState, type CSSProperties } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
import { MemberPlanScreen } from './players/MemberPlanScreen';

type SearchMember = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  isActive: boolean;
  segment: string | null;
};

type PaymentsMemberLookupProps = {
  /** When set, opens that member’s plan screen once */
  openMemberId?: number | null;
  onOpenMemberConsumed?: () => void;
};

export function PaymentsMemberLookup({
  openMemberId = null,
  onOpenMemberConsumed,
}: PaymentsMemberLookupProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (openMemberId == null || !Number.isFinite(openMemberId)) return;
    setSelectedMemberId(openMemberId);
    onOpenMemberConsumed?.();
  }, [openMemberId, onOpenMemberConsumed]);

  useEffect(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      setError('');
      return;
    }

    setSearching(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      api
        .get('/club/admin/members/search', { params: { q } })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setResults(Array.isArray(res.data?.members) ? res.data.members : []);
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setResults([]);
          setError(getErrorMessage(err, 'Failed to search members'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setSearching(false);
        });
    }, 250);

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  return (
    <div style={{ marginTop: '8px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '15px', color: '#2c3e50' }}>Find member</h4>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666' }}>
        Search by name or member ID, then open their plan and payment history.
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name or member ID…"
        aria-label="Search members by name or ID"
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '9px 11px',
          border: '1px solid #b9c7d8',
          borderRadius: '6px',
          backgroundColor: '#f8fbff',
          color: '#17324d',
          fontWeight: 600,
          boxSizing: 'border-box',
        }}
      />
      {searching ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>Searching…</div>
      ) : null}
      {error ? <div className="error-message" style={{ marginTop: '8px' }}>{error}</div> : null}
      {!searching && query.trim() && results.length === 0 && !error ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>No members matched.</div>
      ) : null}
      {results.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>Member</th>
                <th style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>ID</th>
                <th style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>Segment</th>
                <th style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>Email</th>
                <th style={{
                  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>Status</th>
                <th style={{
                  textAlign: 'right', padding: '8px 10px', fontSize: '12px', fontWeight: 700,
                  color: '#3c7890', textTransform: 'uppercase', letterSpacing: '0.03em',
                  borderBottom: '1px solid #d8e8f0', whiteSpace: 'nowrap',
                }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((m) => {
                const name = `${m.firstName} ${m.lastName}`.trim();
                const cell: CSSProperties = {
                  padding: '10px',
                  borderBottom: '1px solid #eee',
                  fontSize: '13px',
                  color: '#17324d',
                  verticalAlign: 'middle',
                };
                return (
                  <tr key={m.id}>
                    <td style={{ ...cell, fontWeight: 600 }}>{name}</td>
                    <td style={{ ...cell, color: '#666', whiteSpace: 'nowrap' }}>#{m.id}</td>
                    <td style={cell}>{m.segment || 'Regular'}</td>
                    <td style={{ ...cell, color: '#666' }}>{m.email || '—'}</td>
                    <td style={cell}>
                      {m.isActive ? (
                        <span style={{ color: '#1e8449' }}>Active</span>
                      ) : (
                        <span style={{ color: '#c0392b', fontWeight: 600 }}>Inactive</span>
                      )}
                    </td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(m.id)}
                        style={{ padding: '4px 10px', fontWeight: 600 }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedMemberId != null ? (
        <MemberPlanScreen
          memberId={selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
        />
      ) : null}
    </div>
  );
}
