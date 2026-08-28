import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../utils/api';
import { getErrorMessage } from '../../utils/errorHandler';
import { isAuthenticated } from '../../utils/auth';
import { formatPlayerName, getNameDisplayOrder } from '../../utils/nameFormatter';
import { PublicLessonShell } from '../public/PublicResultsShell';

type ClassPublic = {
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
    registered: Array<{ id: number; firstName: string; lastName: string }>;
    waitlistCount: number;
  }>;
};

export default function PublicClassPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<ClassPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get(`/public/lessons/classes/${code}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Class not found'));
  }, [code]);

  const register = async (occurrenceId: number, waitlistIfFull: boolean) => {
    setError(null);
    try {
      await api.post(`/lessons/group-occurrences/${occurrenceId}/register`, { waitlistIfFull });
      const res = await api.get(`/public/lessons/classes/${code}`);
      setData(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not register'));
    }
  };

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
          <ul>
            {data.occurrences.map((o) => (
              <li key={o.id}>
                {o.clubDate} {o.startTime}–{o.endTime} · {o.registered.length} registered
                {o.waitlistCount ? ` · ${o.waitlistCount} waitlist` : ''}
                {o.registered.length > 0 ? (
                  <div style={{ fontSize: 13 }}>
                    {o.registered
                      .map((p) => formatPlayerName(p.firstName, p.lastName, getNameDisplayOrder()))
                      .join(', ')}
                  </div>
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
