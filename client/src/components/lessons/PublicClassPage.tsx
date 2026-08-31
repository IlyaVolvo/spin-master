import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAuthenticated } from '../../utils/auth';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { PublicLessonShell } from '../public/PublicResultsShell';

type Person = { id: number; firstName: string; lastName: string };
type ClassPublic = {
  id: number;
  publicCode: string;
  title: string;
  durationMinutes: number;
  pricePerOccurrenceCents: number;
  minParticipants: number;
  maxParticipants: number;
  coaches: Array<{ firstName: string; lastName: string }>;
  occurrences: Array<{
    id: number;
    clubDate: string;
    startTime: string;
    endTime: string;
    registered: Person[];
    designatedPending: Person[];
    waitlistCount: number;
  }>;
};

export default function PublicClassPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const seatToken = searchParams.get('seat');
  const [data, setData] = useState<ClassPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seatDone, setSeatDone] = useState(false);

  const reload = () =>
    api
      .get(`/public/lessons/classes/${code}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Class not found'));

  useEffect(() => {
    reload();
  }, [code]);

  const register = async (occurrenceId: number, waitlistIfFull: boolean) => {
    setError(null);
    try {
      await api.post(`/lessons/group-occurrences/${occurrenceId}/register`, { waitlistIfFull });
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register'));
    }
  };

  const acceptSeat = async () => {
    if (!seatToken) return;
    setError(null);
    try {
      await api.post(`/public/lessons/group-designated/${seatToken}/accept`);
      setSeatDone(true);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not accept seat'));
    }
  };

  const names = (people: Person[]) =>
    people.map((p) => formatPlayerName(p.firstName, p.lastName, getNameDisplayOrder())).join(', ');

  return (
    <PublicLessonShell>
      {error ? <p>{error}</p> : null}
      {data ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{data.title}</h2>
          <p>
            {data.durationMinutes} min · ${(data.pricePerOccurrenceCents / 100).toFixed(2)} per session ·{' '}
            {data.minParticipants}–{data.maxParticipants} players
          </p>
          <p>
            Coaches:{' '}
            {data.coaches
              .map((c) => formatPlayerName(c.firstName, c.lastName, getNameDisplayOrder()))
              .join(', ')}
          </p>
          {seatToken && !seatDone ? (
            <p>
              A seat is reserved for you.{' '}
              <button type="button" onClick={() => void acceptSeat()}>
                Accept reserved seat
              </button>
            </p>
          ) : null}
          {seatDone ? <p>Your reserved seats are confirmed.</p> : null}
          <ul>
            {data.occurrences.map((o) => (
              <li key={o.id}>
                {o.clubDate} {o.startTime}–{o.endTime} · {o.registered.length} registered
                {o.designatedPending.length ? ` · ${o.designatedPending.length} reserved` : ''}
                {o.waitlistCount ? ` · ${o.waitlistCount} waitlist` : ''}
                {o.registered.length > 0 ? (
                  <div style={{ fontSize: 13 }}>Registered: {names(o.registered)}</div>
                ) : null}
                {o.designatedPending.length > 0 ? (
                  <div style={{ fontSize: 13 }}>Reserved: {names(o.designatedPending)}</div>
                ) : null}
                {isAuthenticated() ? (
                  <span>
                    <button type="button" onClick={() => void register(o.id, false)}>
                      Register
                    </button>
                    <button type="button" onClick={() => void register(o.id, true)}>
                      Waitlist if full
                    </button>
                  </span>
                ) : (
                  <span> Log in to register.</span>
                )}
              </li>
            ))}
          </ul>
          <p>
            <Link to="/lessons">Lessons</Link>
          </p>
        </div>
      ) : null}
    </PublicLessonShell>
  );
}
