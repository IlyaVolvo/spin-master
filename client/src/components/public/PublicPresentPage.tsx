import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { connectSocket, getSocket } from '../../utils/socket';
import { formatClubTime, formatYmd } from '../../utils/clubDateTime';
import { hostDutyLabel, type HostDutySlot } from '../../utils/hostDuty';
import { isPublicPresentBoardEnabled, loadPublicSystemConfig } from '../../utils/systemConfig';
import { PublicPresentNotAvailable, PublicResultsShell } from './PublicResultsShell';

type PresentMember = {
  firstName: string;
  lastName: string;
  checkInAt: string;
};

function memberName(row: PresentMember): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  return name || 'Member';
}

const POLL_MS = 15_000;

const PublicPresentPage: React.FC = () => {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [clubDate, setClubDate] = useState('');
  const [members, setMembers] = useState<PresentMember[]>([]);
  const [hosts, setHosts] = useState<HostDutySlot[]>([]);
  const [presentCount, setPresentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRef = React.useRef<number | null>(null);
  const clubDateRef = React.useRef('');

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const config = await loadPublicSystemConfig();
        if (cancelled) return;
        setFeatureEnabled(isPublicPresentBoardEnabled(config));
      } catch {
        if (!cancelled) setFeatureEnabled(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFull = useCallback(async () => {
    const res = await api.get('/public/present');
    setClubDate(typeof res.data?.clubDate === 'string' ? res.data.clubDate : '');
    setPresentCount(Number.isFinite(Number(res.data?.presentCount)) ? Number(res.data.presentCount) : 0);
    const hostRows = Array.isArray(res.data?.hosts) ? res.data.hosts : [];
    setHosts(
      hostRows.filter(
        (row: unknown): row is HostDutySlot =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as HostDutySlot).label === 'string' &&
          typeof (row as HostDutySlot).status === 'string',
      ),
    );
    const rows = Array.isArray(res.data?.members) ? res.data.members : [];
    setMembers(
      rows.filter(
        (row: unknown): row is PresentMember =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as PresentMember).checkInAt === 'string',
      ),
    );
    versionRef.current = Number.isFinite(Number(res.data?.version)) ? Number(res.data.version) : 0;
    clubDateRef.current = typeof res.data?.clubDate === 'string' ? res.data.clubDate : '';
  }, []);

  useEffect(() => {
    if (!featureEnabled) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        await loadFull();
        if (!cancelled) {
          setError(null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load the present list.');
          setLoading(false);
        }
      }
    };

    void refresh();
    const timer = window.setInterval(async () => {
      try {
        const probe = await api.get('/public/present/version');
        const nextVersion = Number.isFinite(Number(probe.data?.version)) ? Number(probe.data.version) : 0;
        const nextClubDate = typeof probe.data?.clubDate === 'string' ? probe.data.clubDate : '';
        if (nextVersion !== versionRef.current || nextClubDate !== clubDateRef.current) {
          await loadFull();
        }
      } catch {
        // ignore transient probe failures; full load on next tick
      }
    }, POLL_MS);

    connectSocket();
    const socket = getSocket();
    const onPresenceBoardChange = () => {
      void loadFull();
    };
    socket?.on('club:visitUpdated', onPresenceBoardChange);
    socket?.on('club:hostBoardUpdated', onPresenceBoardChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      socket?.off('club:visitUpdated', onPresenceBoardChange);
      socket?.off('club:hostBoardUpdated', onPresenceBoardChange);
    };
  }, [featureEnabled, loadFull]);

  if (featureEnabled === null) {
    return (
      <PublicResultsShell>
        <div className="card">
          <p style={{ margin: 0 }}>Loading…</p>
        </div>
      </PublicResultsShell>
    );
  }

  if (!featureEnabled) {
    return <PublicPresentNotAvailable />;
  }

  const dayLabel = formatYmd(clubDate) ?? clubDate;

  return (
    <PublicResultsShell>
      {hosts.length > 0 ? (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ marginTop: 0, marginBottom: '12px' }}>Host on duty</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {hosts.map((slot) => (
              <li
                key={`${slot.startTime}-${slot.endTime}-${slot.label}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#f4f7fa',
                }}
              >
                <span style={{ fontWeight: 600, color: '#1f3b57' }}>{slot.label}</span>
                <span
                  style={{
                    color: slot.status === 'arrived' ? '#1e8449' : '#5d6d7e',
                    fontWeight: slot.status === 'arrived' ? 600 : 500,
                  }}
                >
                  {hostDutyLabel(slot)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: '8px' }}>Present now</h2>
        <p style={{ marginTop: 0, marginBottom: '16px', color: '#546e7a' }}>
          {presentCount === 1 ? '1 member' : `${presentCount} members`} checked in
          {dayLabel ? ` · ${dayLabel}` : ''}
        </p>
        {loading ? (
          <p style={{ margin: 0 }}>Loading…</p>
        ) : error ? (
          <p style={{ margin: 0, color: '#c62828' }}>{error}</p>
        ) : members.length === 0 ? (
          <p style={{ margin: 0 }}>No one is checked in right now.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #cfd8dc' }}>Member</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #cfd8dc' }}>Arrived</th>
                </tr>
              </thead>
              <tbody>
                {members.map((row, index) => (
                  <tr key={`${row.firstName}-${row.lastName}-${row.checkInAt}-${index}`}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eceff1' }}>{memberName(row)}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #eceff1' }}>{formatClubTime(row.checkInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PublicResultsShell>
  );
};

export default PublicPresentPage;
