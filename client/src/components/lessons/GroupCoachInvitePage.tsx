import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { PublicLessonShell } from '../public/PublicResultsShell';
import { formatSlotRange } from './availabilityDraft';

type InvitePublic = {
  inviteStatus: string;
  conflict: boolean;
  conflictMessage: string | null;
  title: string;
  startsOn: string;
  occurrences: Array<{ clubDate: string; startTime: string; endTime: string }>;
  creator: { firstName: string; lastName: string };
};

export default function GroupCoachInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<InvitePublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .get(`/public/lessons/group-coach-invites/${token}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Invitation not found'));
  };

  useEffect(() => {
    load();
  }, [token]);

  const act = async (action: 'accept' | 'deny') => {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/public/lessons/group-coach-invites/${token}/${action}`);
      setDone(action === 'accept' ? 'You accepted this class.' : 'You declined this class.');
      load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not respond'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const preset = searchParams.get('action');
    if (!data || data.inviteStatus !== 'INVITED' || busy || done) return;
    if (preset === 'accept' && !data.conflict) void act('accept');
    if (preset === 'deny') void act('deny');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.inviteStatus]);

  return (
    <PublicLessonShell>
      {error ? <p>{error}</p> : null}
      {done ? <p>{done}</p> : null}
      {data ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{data.title}</h2>
          <p>
            Invite from {formatPlayerName(data.creator.firstName, data.creator.lastName, getNameDisplayOrder())}
          </p>
          <ul>
            {data.occurrences.slice(0, 8).map((o) => (
              <li key={`${o.clubDate}-${o.startTime}`}>
                {o.clubDate} {formatSlotRange(o.startTime, o.endTime)}
              </li>
            ))}
          </ul>
          {data.inviteStatus === 'INVITED' ? (
            <p>
              {data.conflict ? <span>{data.conflictMessage}. </span> : null}
              <button type="button" disabled={busy || data.conflict} onClick={() => void act('accept')}>
                Accept
              </button>{' '}
              <button type="button" disabled={busy} onClick={() => void act('deny')}>
                Decline
              </button>
            </p>
          ) : (
            <p>This invitation is {data.inviteStatus.toLowerCase()}.</p>
          )}
          <p>
            <Link to="/lessons?view=invitations">Invitations</Link>
          </p>
        </div>
      ) : null}
    </PublicLessonShell>
  );
}
