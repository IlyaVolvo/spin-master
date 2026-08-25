import { afterEach, describe, expect, it } from 'vitest';
import type { Member } from '../types/member';
import {
  applyPlayerCreated,
  applyPlayerDeleted,
  applyPlayerUpdated,
  applyPlayersImported,
  clearMembersRosterCache,
  membersCache,
  setMembersRoster,
  subscribeMembersRoster,
} from './membersRosterCache';

function member(overrides: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    birthDate: null,
    isActive: true,
    rating: 1400,
    email: null,
    gender: 'NOT_SPECIFIED',
    roles: ['PLAYER'],
    ...overrides,
  };
}

describe('membersRosterCache', () => {
  afterEach(() => {
    clearMembersRosterCache();
  });

  it('ignores socket events until a roster has been loaded', () => {
    expect(applyPlayerCreated(member({ id: 1 }))).toBe(false);
    applyPlayerUpdated(member({ id: 1, firstName: 'Ann' }));
    applyPlayerDeleted(1);
    expect(membersCache.data).toBeNull();
  });

  it('adds a new member once and upserts duplicates from player:created', () => {
    setMembersRoster([member({ id: 1, lastName: 'One' })]);
    expect(applyPlayerCreated(member({ id: 2, lastName: 'Two' }))).toBe(true);
    expect(applyPlayerCreated(member({ id: 2, lastName: 'Two Updated' }))).toBe(false);
    expect(membersCache.data?.map((row) => row.id)).toEqual([1, 2]);
    expect(membersCache.data?.find((row) => row.id === 2)?.lastName).toBe('Two Updated');
  });

  it('patches profile fields and inserts a missing updated member', () => {
    setMembersRoster([member({ id: 1, phone: null })]);
    applyPlayerUpdated(member({ id: 1, phone: '555-0100' }));
    applyPlayerUpdated(member({ id: 3, firstName: 'New' }));
    expect(membersCache.data?.find((row) => row.id === 1)?.phone).toBe('555-0100');
    expect(membersCache.data?.some((row) => row.id === 3)).toBe(true);
  });

  it('removes a deleted member and notifies subscribers', () => {
    setMembersRoster([member({ id: 1 }), member({ id: 2 })]);
    let ticks = 0;
    const unsub = subscribeMembersRoster(() => {
      ticks += 1;
    });
    applyPlayerDeleted(1);
    unsub();
    expect(membersCache.data?.map((row) => row.id)).toEqual([2]);
    expect(ticks).toBe(1);
  });

  it('invalidates the cache on bulk import so views refetch', () => {
    setMembersRoster([member({ id: 1 })]);
    applyPlayersImported();
    expect(membersCache.data).toBeNull();
  });
});
