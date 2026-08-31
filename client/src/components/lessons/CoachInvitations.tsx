import { useEffect, useState, type CSSProperties } from 'react';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { formatSlotRange } from './availabilityDraft';

const bar: CSSProperties = {
  padding: '8px 16px',
  background: '#2c3e50',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};

const td: CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderTop: '1px solid #e8eef3',
  verticalAlign: 'top',
};

type InviteRow = {
  id: number;
  conflict: boolean;
  conflictMessage: string | null;
  groupClass: {
    title: string;
    startsOn: string;
    creator?: { member?: { firstName: string; lastName: string } };
    occurrences?: Array<{ clubDate: string; startTime: string; endTime: string }>;
  };
};

export default function CoachInvitations({ onError }: { onError: (m: string | null) => void }) {
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const load = () => {
    api
      .get('/lessons/group-invites')
      .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
      .catch((err) => onError(getErrorMessage(err, 'Could not load invitations')));
  };
  useEffect(() => {
    load();
  }, [onError]);

  const act = (id: number, path: 'accept' | 'deny', fail: string) => {
    onError(null);
    setBusyId(id);
    api
      .post(`/lessons/group-invites/${id}/${path}`)
      .then(() => load())
      .catch((err) => onError(getErrorMessage(err, fail)))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', width: 'fit-content', maxWidth: '100%' }}>
      <div style={bar}>Invitations</div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...td, borderTop: 'none', textAlign: 'left' }}>Class</th>
            <th style={{ ...td, borderTop: 'none', textAlign: 'left' }}>When</th>
            <th style={{ ...td, borderTop: 'none', textAlign: 'left' }}>From</th>
            <th style={{ ...td, borderTop: 'none' }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...td, color: '#64748b' }}>
                No open class invitations.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const creator = row.groupClass.creator?.member;
              const first = row.groupClass.occurrences?.[0];
              return (
                <tr key={row.id}>
                  <td style={td}>{row.groupClass.title}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {first
                      ? `${first.clubDate} ${formatSlotRange(first.startTime, first.endTime)}`
                      : row.groupClass.startsOn}
                    {row.conflict ? (
                      <div style={{ color: '#b45309', fontSize: 12, marginTop: 4 }}>
                        {row.conflictMessage || 'You have a conflict at this time'}
                      </div>
                    ) : null}
                  </td>
                  <td style={td}>
                    {creator
                      ? formatPlayerName(creator.firstName, creator.lastName, getNameDisplayOrder())
                      : 'Coach'}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.conflict}
                      title={row.conflict ? row.conflictMessage || 'Conflict' : 'Accept'}
                      onClick={() => act(row.id, 'accept', 'Could not accept')}
                    >
                      Accept
                    </button>{' '}
                    <button
                      type="button"
                      className="danger"
                      disabled={busyId === row.id}
                      onClick={() => act(row.id, 'deny', 'Could not decline')}
                    >
                      Decline
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
