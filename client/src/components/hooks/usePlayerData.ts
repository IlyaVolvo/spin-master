import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { isAdmin } from '../../utils/auth';
import { connectSocket } from '../../utils/socket';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  isActive: boolean;
  rating: number | null;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  roles: string[];
  picture?: string | null;
  phone?: string | null;
  address?: string | null;
}

// Module-level cache to persist across component mounts/unmounts
export const membersCache: {
  data: Member[] | null;
  lastFetch: number;
} = {
  data: null,
  lastFetch: 0,
};

interface UsePlayerDataParams {
  setError: (msg: string) => void;
}

export function usePlayerData({ setError }: UsePlayerDataParams) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      // For admins, always fetch all members; for others, fetch only players (members with PLAYER role)
      const endpoint = isAdmin() ? '/players/all-members' : '/players';
      const response = await api.get(endpoint);
      setMembers(response.data);
      // Update cache
      membersCache.data = response.data;
      membersCache.lastFetch = Date.now();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch or use cache
  useEffect(() => {
    if (membersCache.data !== null) {
      setMembers(membersCache.data);
      setLoading(false);
    } else {
      fetchMembers();
    }
  }, []);

  // Set up Socket.io connection for real-time player updates
  useEffect(() => {
    const socket = connectSocket();

    // Listen for player creation
    socket?.on('player:created', (data: { player: Member; timestamp: number }) => {
      // Update cache with new player
      if (membersCache.data) {
        membersCache.data = [...membersCache.data, data.player];
        membersCache.lastFetch = Date.now();
        // Update state if component is mounted
        setMembers([...membersCache.data]);
      } else {
        // Cache not initialized, fetch fresh data
        fetchMembers();
      }
    });

    // Listen for player updates
    socket?.on('player:updated', (data: { player: Member; timestamp: number }) => {
      // Update cache with updated player
      if (membersCache.data) {
        const index = membersCache.data.findIndex(p => p.id === data.player.id);
        if (index !== -1) {
          membersCache.data[index] = data.player;
        } else {
          // Player not in cache, add it
          membersCache.data.push(data.player);
        }
        membersCache.lastFetch = Date.now();
        // Update state if component is mounted
        setMembers([...membersCache.data]);
      } else {
        // Cache not initialized, fetch fresh data
        fetchMembers();
      }
    });

    // Listen for player imports (refresh entire list)
    socket?.on('players:imported', () => {
      // Invalidate cache and fetch fresh data
      membersCache.data = null;
      membersCache.lastFetch = 0;
      fetchMembers();
    });

    return () => {
      // Clean up socket listeners
      socket?.off('player:created');
      socket?.off('player:updated');
      socket?.off('players:imported');
    };
  }, []);

  return {
    members,
    setMembers,
    loading,
    setLoading,
    fetchMembers,
  };
}
