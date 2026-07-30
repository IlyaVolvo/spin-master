/**
 * Payment / check-in — expiry banner messages
 */
jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: jest.fn(),
}));

import { getPaymentsConfig } from '../../../src/services/systemConfigService';
import { getExpiryWarning } from '../../../src/payments/checkInReminders';

describe('getExpiryWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      reminders: {
        checkInBannerEnabled: true,
        periodDaysBeforeExpiry: 3,
        visitPackVisitsRemaining: 2,
      },
    });
  });

  it('returns null when banners are disabled', () => {
    (getPaymentsConfig as jest.Mock).mockReturnValue({
      reminders: {
        checkInBannerEnabled: false,
        periodDaysBeforeExpiry: 30,
        visitPackVisitsRemaining: 10,
      },
    });
    expect(
      getExpiryWarning({
        type: 'MONTHLY',
        validTo: new Date(Date.now() + 86400000),
        visitsRemaining: null,
      }),
    ).toBeNull();
  });

  it('warns when visit pack remaining is at/below threshold', () => {
    expect(
      getExpiryWarning({ type: 'VISIT_PACK', validTo: null, visitsRemaining: 2 }),
    ).toBe('Only 2 visit(s) remaining on your plan.');
    expect(
      getExpiryWarning({ type: 'VISIT_PACK', validTo: null, visitsRemaining: 3 }),
    ).toBeNull();
  });

  it('warns when period plan is within days threshold', () => {
    const inTwoDays = new Date(Date.now() + 2 * 86400000);
    expect(
      getExpiryWarning({ type: 'MONTHLY', validTo: inTwoDays, visitsRemaining: null }),
    ).toMatch(/expires in \d+ day/);
    const inTenDays = new Date(Date.now() + 10 * 86400000);
    expect(
      getExpiryWarning({ type: 'YEARLY', validTo: inTenDays, visitsRemaining: null }),
    ).toBeNull();
  });
});
