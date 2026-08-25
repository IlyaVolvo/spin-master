import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { isAdmin } from '../../utils/auth';
import type { Member } from '../../types/member';
import {
  membersCache,
  setMembersRoster,
  subscribeMembersRoster,
} from '../../utils/membersRosterCache';

export { membersCache };

interface UsePlayerDataParams {
  setError: (msg: string) => void;
}

export function usePlayerData({ setError }: UsePlayerDataParams) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const setErrorRef = useRef(setError);
  setErrorRef.current = setError;

  const fetchMembers = async () => {
    try {
      setLoading(true);
      // For admins, always fetch all members; for others, fetch only players (members with PLAYER role)
      const endpoint = isAdmin() ? '/players/all-members' : '/players';
      const response = await api.get(endpoint);
      const rows = Array.isArray(response.data) ? response.data : [];
      setMembersRoster(rows);
      setMembers(rows);
    } catch (err: any) {
      setErrorRef.current(err.response?.data?.error || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembersRef = useRef(fetchMembers);
  fetchMembersRef.current = fetchMembers;

  // Initial fetch or use cache. Admins need planIndicator on every row — refetch if cache is stale.
  useEffect(() => {
    const cacheMissingPlanIndicator =
      isAdmin() &&
      membersCache.data !== null &&
      membersCache.data.some((m) => m.planIndicator == null);

    if (membersCache.data !== null && !cacheMissingPlanIndicator) {
      setMembers(membersCache.data);
      setLoading(false);
    } else {
      void fetchMembersRef.current();
    }
  }, []);

  // Socket events are applied to membersCache in App while authenticated; keep local state in sync.
  useEffect(() => {
    return subscribeMembersRoster(() => {
      if (membersCache.data) {
        setMembers([...membersCache.data]);
        setLoading(false);
        return;
      }
      void fetchMembersRef.current();
    });
  }, []);

  return {
    members,
    setMembers,
    loading,
    setLoading,
    fetchMembers,
  };
}
