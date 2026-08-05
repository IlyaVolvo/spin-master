import {
  formatCourtesyAdmissionBasis,
  formatEventAdmissionBasis,
  formatPlanAdmissionBasis,
  formatTrialAdmissionBasis,
  resolveVisitAdmissionBasis,
} from '../../../src/payments/visitAdmissionBasis';

describe('visitAdmissionBasis', () => {
  it('formats trial and courtesy', () => {
    expect(formatTrialAdmissionBasis()).toBe('Trial');
    expect(formatCourtesyAdmissionBasis()).toBe('Courtesy');
  });

  it('formats event as the event name', () => {
    expect(formatEventAdmissionBasis('Club Championship')).toBe('Club Championship');
    expect(formatEventAdmissionBasis('  ')).toBe('Event');
  });

  it('formats visit-pack plan as name with remaining', () => {
    expect(
      formatPlanAdmissionBasis({
        type: 'VISIT_PACK',
        label: '10 Visit',
        visitsRemaining: 3,
        visitsTotal: 10,
        validFrom: null,
        validTo: null,
      }),
    ).toBe('10 Visit (3 remaining)');
  });

  it('formats time plan as name with start - end dates', () => {
    expect(
      formatPlanAdmissionBasis({
        type: 'MONTHLY',
        label: 'Monthly',
        visitsRemaining: null,
        visitsTotal: null,
        validFrom: new Date('2026-08-01T12:00:00.000Z'),
        validTo: new Date('2026-09-01T12:00:00.000Z'),
      }),
    ).toBe('Monthly (2026-08-01 - 2026-09-01)');
  });

  it('prefers stored admissionBasis snapshot', () => {
    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: null,
        isCourtesy: true,
        dailyPaymentApplied: false,
        admissionBasis: '10 Visit (2 remaining)',
      }),
    ).toBe('10 Visit (2 remaining)');
  });

  it('infers event / courtesy / trial / plan from row flags', () => {
    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: null,
        isCourtesy: false,
        dailyPaymentApplied: false,
        eventTournamentId: 35,
        eventName: 'Club Championship',
      }),
    ).toBe('Club Championship');

    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: null,
        isCourtesy: true,
        dailyPaymentApplied: false,
      }),
    ).toBe('Courtesy');

    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: null,
        isCourtesy: false,
        dailyPaymentApplied: true,
      }),
    ).toBe('Plan');

    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: null,
        isCourtesy: false,
        dailyPaymentApplied: false,
      }),
    ).toBe('Trial');
  });

  it('returns null for rejected visits', () => {
    expect(
      resolveVisitAdmissionBasis({
        rejectedAt: new Date(),
        isCourtesy: false,
        dailyPaymentApplied: false,
        admissionBasis: 'Trial',
      }),
    ).toBeNull();
  });
});
