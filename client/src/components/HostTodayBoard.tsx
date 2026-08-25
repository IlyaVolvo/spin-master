import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import api from '../utils/api';
import { connectSocket, getSocket } from '../utils/socket';
import { getErrorMessage } from '../utils/errorHandler';
import {
  type HostBoardSlot,
  hostMemberName,
  hostSlotCaption,
} from '../utils/hostBoard';

type HostTodayBoardProps = {
  variant: 'header' | 'full';
};

export function HostTodayBoard({ variant }: HostTodayBoardProps) {
  const [clubDate, setClubDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<HostBoardSlot[]>([]);
  const [error, setError] = useState('');
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ clubDate: string; slots: HostBoardSlot[] }>('/club/host/today');
      setClubDate(res.data?.clubDate ?? null);
      setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load hosts'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = () => {
      void refresh();
    };
    socket.on('club:hostBoardUpdated', onUpdate);
    return () => {
      socket.off('club:hostBoardUpdated', onUpdate);
    };
  }, [refresh]);

  const claim = async (shiftId: number) => {
    setClaimingId(shiftId);
    setError('');
    try {
      await api.post('/club/host/claim', { shiftId });
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not claim host'));
    } finally {
      setClaimingId(null);
    }
  };

  if (slots.length === 0 && !error) {
    if (variant === 'header') return null;
    return (
      <p style={{ margin: 0, color: '#5d6d7e', fontSize: '14px' }}>
        No host slots today.
      </p>
    );
  }

  const compactChip: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 8px',
    borderRadius: '999px',
    background: '#e8eef4',
    color: '#1f3b57',
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  if (variant === 'header') {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center',
          marginTop: '6px',
          maxWidth: '100%',
        }}
        title="Today's hosts"
      >
        <span style={{ ...compactChip, background: '#d6e4f0', fontWeight: 700 }}>
          Hosts
        </span>
        {slots.map((slot) => {
          const name = hostMemberName(slot.member) || 'Unassigned';
          const claimed = Boolean(slot.claimedAt);
          return (
            <span key={`${slot.templateId || 'c'}-${slot.shiftId || slot.startTime}`} style={compactChip}>
              <span style={{ opacity: 0.8 }}>{hostSlotCaption(slot)}</span>
              <span>{name}</span>
              {claimed ? <span style={{ color: '#1e8449' }}>claimed</span> : null}
              {slot.claimable && slot.shiftId != null ? (
                <button
                  type="button"
                  onClick={() => void claim(slot.shiftId as number)}
                  disabled={claimingId === slot.shiftId}
                  style={{
                    border: 'none',
                    background: '#27ae60',
                    color: 'white',
                    borderRadius: '999px',
                    padding: '1px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Claim
                </button>
              ) : null}
            </span>
          );
        })}
        {error ? <span style={{ ...compactChip, background: '#c0392b' }}>{error}</span> : null}
      </div>
    );
  }

  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d5dbe3',
        borderRadius: '12px',
        padding: '14px 16px',
        boxShadow: '0 1px 4px rgba(31, 59, 87, 0.06)',
      }}
    >
      <h2 style={{ margin: '0 0 10px', fontSize: '16px', color: '#1f3b57' }}>
        Today’s hosts{clubDate ? ` · ${clubDate}` : ''}
      </h2>
      {error ? <p style={{ color: '#c0392b', fontSize: '13px' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {slots.map((slot) => {
          const name = hostMemberName(slot.member) || 'Unassigned';
          return (
            <li
              key={`${slot.templateId || 'c'}-${slot.shiftId || slot.startTime}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: '#f4f7fa',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#1f3b57', fontSize: '14px' }}>
                  {hostSlotCaption(slot)}
                </div>
                <div style={{ fontSize: '13px', color: '#5d6d7e' }}>
                  {name}
                  {slot.claimedAt ? ' · claimed' : slot.member ? ' · not yet claimed' : ''}
                </div>
              </div>
              {slot.claimable && slot.shiftId != null ? (
                <button
                  type="button"
                  onClick={() => void claim(slot.shiftId as number)}
                  disabled={claimingId === slot.shiftId}
                  style={{
                    border: 'none',
                    background: '#27ae60',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  I hosted
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
