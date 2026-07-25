import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { loadPublicSystemConfig } from '../../utils/systemConfig';
import { PublicResultsShell } from './PublicResultsShell';
import { formatMatchDateRange } from './formatMatchDateRange';

interface PublicResultsListItem {
  id: number;
  name: string | null;
  type: string;
  matchDateFrom: string | null;
  matchDateTo: string | null;
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ');
}

const PublicResultsListPage: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [tournaments, setTournaments] = useState<PublicResultsListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPublicSystemConfig();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {};
        if (appliedFrom) params.from = appliedFrom;
        if (appliedTo) params.to = appliedTo;
        const response = await api.get('/public/results/list', { params });
        if (!cancelled) {
          setTournaments(response.data?.tournaments ?? []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Could not load tournament results.');
          setTournaments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [appliedFrom, appliedTo]);

  const applyFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedFrom(from);
    setAppliedTo(to);
  };

  const clearFilter = () => {
    setFrom('');
    setTo('');
    setAppliedFrom('');
    setAppliedTo('');
  };

  return (
    <PublicResultsShell title="All tournament results">
      <div className="card" style={{ marginBottom: '16px', backgroundColor: '#f5f7fa', border: '1px solid #cfd8dc' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#37474f', marginBottom: '10px' }}>
          Filter by date
        </div>
        <form onSubmit={applyFilter} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 600, color: '#37474f' }}>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                fontSize: '14px',
                padding: '10px 20px',
                minWidth: '180px',
                height: '40px',
                boxSizing: 'border-box',
                border: '2px solid #90a4ae',
                borderRadius: '4px',
                backgroundColor: '#fff',
                color: '#263238',
                lineHeight: '1.2',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 600, color: '#37474f' }}>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                fontSize: '14px',
                padding: '10px 20px',
                minWidth: '180px',
                height: '40px',
                boxSizing: 'border-box',
                border: '2px solid #90a4ae',
                borderRadius: '4px',
                backgroundColor: '#fff',
                color: '#263238',
                lineHeight: '1.2',
              }}
            />
          </label>
          <button type="submit" className="button-3d" style={{ height: '40px', boxSizing: 'border-box' }}>
            Filter
          </button>
          <button type="button" className="button-filter" onClick={clearFilter} style={{ height: '40px', boxSizing: 'border-box' }}>
            Clear
          </button>
        </form>
      </div>

      <div className="card">
        {loading && <p>Loading...</p>}
        {error && <div className="error-message">{error}</div>}
        {!loading && !error && tournaments.length === 0 && (
          <p style={{ margin: 0 }}>No completed tournaments match this filter.</p>
        )}
        {!loading && tournaments.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tournaments.map((tournament) => (
              <li
                key={tournament.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '12px 0',
                  borderBottom: '1px solid #e0e0e0',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <Link to={`/public/results/${tournament.id}`} style={{ fontWeight: 600 }}>
                    {tournament.name || `Tournament ${tournament.id}`}
                  </Link>
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                    {formatType(tournament.type)}
                    <span style={{ fontSize: '12px', marginLeft: '8px' }}>
                      {formatMatchDateRange(tournament.matchDateFrom, tournament.matchDateTo)}
                    </span>
                  </div>
                </div>
                <Link to={`/public/results/${tournament.id}`}>View results</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicResultsShell>
  );
};

export default PublicResultsListPage;
