/**
 * In-memory check-in state for a single Node instance.
 * Write-through on toggle paths; rare out-of-band writers must call invalidate*.
 * TTL is a last-resort safety net if an invalidate is missed — not the primary
 * correctness mechanism.
 * Not safe across multiple web instances without a shared store.
 * Durable truth remains Postgres — cache is never a substitute for visit/payment writes.
 */

import type { ClubEntitlement } from '@prisma/client';

/** Last-resort TTL if invalidate is missed (24h). Prefer explicit invalidate*. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry<T> = { value: T; expiresAt: number };

export type MemberCheckInStub = {
  id: number;
  firstName: string;
  lastName: string;
  isActive: boolean;
  scorePin: string;
  email: string | null;
  password: string | null;
  trialEndsOn: Date | null;
};

const memberStubs = new Map<number, CacheEntry<MemberCheckInStub>>();
const currentEntitlements = new Map<number, CacheEntry<ClubEntitlement | null>>();

function readEntry<T>(map: Map<number, CacheEntry<T>>, id: number): T | undefined {
  const entry = map.get(id);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(id);
    return undefined;
  }
  return entry.value;
}

function writeEntry<T>(map: Map<number, CacheEntry<T>>, id: number, value: T, ttlMs: number): void {
  map.set(id, { value, expiresAt: Date.now() + ttlMs });
}

export function getCachedMemberCheckInStub(memberId: number): MemberCheckInStub | undefined {
  return readEntry(memberStubs, memberId);
}

export function setCachedMemberCheckInStub(
  stub: MemberCheckInStub,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  writeEntry(memberStubs, stub.id, stub, ttlMs);
}

export function invalidateMemberCheckInStub(memberId: number): void {
  memberStubs.delete(memberId);
}

export function getCachedCurrentEntitlement(memberId: number): ClubEntitlement | null | undefined {
  return readEntry(currentEntitlements, memberId);
}

export function setCachedCurrentEntitlement(
  memberId: number,
  entitlement: ClubEntitlement | null,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  writeEntry(currentEntitlements, memberId, entitlement, ttlMs);
}

export function invalidateCurrentEntitlement(memberId: number): void {
  currentEntitlements.delete(memberId);
}

/** Clear member stub + CURRENT entitlement (rare out-of-band DB changes). */
export function invalidateCheckInStateForMember(memberId: number): void {
  invalidateMemberCheckInStub(memberId);
  invalidateCurrentEntitlement(memberId);
}

/** Test helper */
export function clearCheckInStateCache(): void {
  memberStubs.clear();
  currentEntitlements.clear();
}
