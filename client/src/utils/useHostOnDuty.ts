import { useCallback, useEffect, useState } from 'react';
import api from './api';
import { getSocket, connectSocket } from './socket';
import { hostOnDutyFooterText, type HostDutySlot } from './hostDuty';

export function useHostOnDutyText(): string | null {
  const [hostText, setHostText] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/club/host/on-duty');
      const hosts = Array.isArray(res.data?.hosts) ? res.data.hosts : [];
      const parsed = hosts.filter(
        (row: unknown): row is HostDutySlot =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as HostDutySlot).status === 'string',
      );
      setHostText(hostOnDutyFooterText(parsed));
    } catch {
      setHostText(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    connectSocket();
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = () => {
      void refresh();
    };
    socket.on('club:hostBoardUpdated', onUpdate);
    socket.on('club:visitUpdated', onUpdate);
    return () => {
      socket.off('club:hostBoardUpdated', onUpdate);
      socket.off('club:visitUpdated', onUpdate);
    };
  }, [refresh]);

  return hostText;
}
