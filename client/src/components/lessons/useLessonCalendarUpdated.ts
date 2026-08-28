import { useEffect, useRef } from 'react';
import { connectSocket, getSocket } from '../../utils/socket';

export type LessonCalendarUpdatedPayload = {
  coachProfileId?: number | null;
  memberId?: number | null;
  reason?: string;
  clubDate?: string | null;
  timestamp?: number;
};

function payloadMatches(
  payload: LessonCalendarUpdatedPayload,
  filter?: { coachProfileId?: number | null; memberId?: number | null },
): boolean {
  if (!filter) return true;
  const wantCoach = filter.coachProfileId != null && filter.coachProfileId > 0;
  const wantMember = filter.memberId != null && filter.memberId > 0;
  if (!wantCoach && !wantMember) return true;
  if (wantCoach && payload.coachProfileId === filter.coachProfileId) return true;
  if (wantMember && payload.memberId === filter.memberId) return true;
  return false;
}

/** Reload lesson calendars when availability or reservations change. */
export function useLessonCalendarUpdated(
  onUpdate: (payload: LessonCalendarUpdatedPayload | null) => void,
  filter?: { coachProfileId?: number | null; memberId?: number | null },
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    if (!socket) return;
    let timer: number | null = null;
    let sawConnect = socket.connected;
    const fire = (payload: LessonCalendarUpdatedPayload | null) => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        onUpdateRef.current(payload);
      }, 150);
    };
    const onEvent = (payload: LessonCalendarUpdatedPayload) => {
      if (!payloadMatches(payload || {}, filterRef.current)) return;
      fire(payload || {});
    };
    const onConnect = () => {
      if (sawConnect) fire(null);
      sawConnect = true;
    };
    socket.on('lessons:calendarUpdated', onEvent);
    socket.on('connect', onConnect);
    return () => {
      socket.off('lessons:calendarUpdated', onEvent);
      socket.off('connect', onConnect);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);
}
