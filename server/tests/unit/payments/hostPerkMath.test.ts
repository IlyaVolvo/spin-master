import { addUtcDays, computeHostPerkEntitlementPatches, perkAmountsForPlan } from '../../../src/payments/hostPerkMath';
import { isHostClaimWindowOpen, isHostClaimWindowPast } from '../../../src/payments/hostWindowMath';

describe('hostPerkMath', () => {
  it('adds UTC calendar days', () => {
    const start = new Date('2026-03-31T12:00:00.000Z');
    expect(addUtcDays(start, 7).toISOString()).toBe('2026-04-07T12:00:00.000Z');
  });

  it('reads TIME vs VISIT perk amounts from the plan', () => {
    expect(perkAmountsForPlan({ kind: 'TIME', hostPerkDays: 2, hostPerkVisits: 9 })).toEqual({
      days: 2,
      visits: 0,
    });
    expect(perkAmountsForPlan({ kind: 'VISIT', hostPerkDays: 2, hostPerkVisits: 3 })).toEqual({
      days: 0,
      visits: 3,
    });
  });

  it('extends current TIME validTo and shifts a future TIME plan', () => {
    const patches = computeHostPerkEntitlementPatches({
      current: {
        type: 'MONTHLY',
        validTo: new Date('2026-03-31T12:00:00.000Z'),
        visitsRemaining: null,
        visitsTotal: null,
      },
      future: {
        type: 'MONTHLY',
        validFrom: new Date('2026-03-31T12:00:00.000Z'),
        validTo: new Date('2026-04-30T12:00:00.000Z'),
      },
      days: 7,
      visits: 0,
    });
    expect(patches.current.validTo?.toISOString()).toBe('2026-04-07T12:00:00.000Z');
    expect(patches.future?.validFrom?.toISOString()).toBe('2026-04-07T12:00:00.000Z');
    expect(patches.future?.validTo?.toISOString()).toBe('2026-05-07T12:00:00.000Z');
  });

  it('does not shift a future visit pack when extending a TIME current', () => {
    const patches = computeHostPerkEntitlementPatches({
      current: {
        type: 'MONTHLY',
        validTo: new Date('2026-03-31T12:00:00.000Z'),
        visitsRemaining: null,
        visitsTotal: null,
      },
      future: {
        type: 'VISIT_PACK',
        validFrom: new Date('2026-03-31T12:00:00.000Z'),
        validTo: null,
      },
      days: 7,
      visits: 0,
    });
    expect(patches.current.validTo?.toISOString()).toBe('2026-04-07T12:00:00.000Z');
    expect(patches.future).toBeNull();
  });

  it('adds visits to remaining and total', () => {
    const patches = computeHostPerkEntitlementPatches({
      current: {
        type: 'VISIT_PACK',
        validTo: null,
        visitsRemaining: 2,
        visitsTotal: 10,
      },
      future: null,
      days: 0,
      visits: 3,
    });
    expect(patches.current.visitsRemaining).toBe(5);
    expect(patches.current.visitsTotal).toBe(13);
    expect(patches.future).toBeNull();
  });

  it('applies zero perks as a no-op patch', () => {
    const patches = computeHostPerkEntitlementPatches({
      current: {
        type: 'MONTHLY',
        validTo: new Date('2026-03-31T12:00:00.000Z'),
        visitsRemaining: null,
        visitsTotal: null,
      },
      future: null,
      days: 0,
      visits: 0,
    });
    expect(patches.current).toEqual({});
  });
});

describe('hostWindow', () => {
  const startAtMs = Date.parse('2026-08-24T18:00:00.000Z');
  const graceMinutes = 30;

  it('is open all that club day until start + grace', () => {
    expect(
      isHostClaimWindowOpen({
        clubDate: '2026-08-24',
        todayYmd: '2026-08-24',
        startAtMs,
        graceMinutes,
        nowMs: Date.parse('2026-08-24T10:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isHostClaimWindowOpen({
        clubDate: '2026-08-24',
        todayYmd: '2026-08-24',
        startAtMs,
        graceMinutes,
        nowMs: Date.parse('2026-08-24T18:30:00.000Z'),
      }),
    ).toBe(true);
  });

  it('closes after grace and is not open on another day', () => {
    expect(
      isHostClaimWindowOpen({
        clubDate: '2026-08-24',
        todayYmd: '2026-08-24',
        startAtMs,
        graceMinutes,
        nowMs: Date.parse('2026-08-24T18:30:01.000Z'),
      }),
    ).toBe(false);
    expect(
      isHostClaimWindowOpen({
        clubDate: '2026-08-24',
        todayYmd: '2026-08-23',
        startAtMs,
        graceMinutes,
        nowMs: Date.parse('2026-08-23T20:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('treats a previous club day as past even before that slot clock time', () => {
    expect(
      isHostClaimWindowPast({
        clubDate: '2026-08-23',
        todayYmd: '2026-08-24',
        startAtMs: Date.parse('2026-08-23T18:00:00.000Z'),
        graceMinutes,
        nowMs: Date.parse('2026-08-24T10:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isHostClaimWindowPast({
        clubDate: '2026-08-25',
        todayYmd: '2026-08-24',
        startAtMs: Date.parse('2026-08-25T18:00:00.000Z'),
        graceMinutes,
        nowMs: Date.parse('2026-08-24T10:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
