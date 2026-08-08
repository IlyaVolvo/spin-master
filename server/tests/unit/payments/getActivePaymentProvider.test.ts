/**
 * Payment feature — per-member online provider resolution
 */
const mockHas = jest.fn();
const mockGet = jest.fn();
const mockGetAll = jest.fn();
const mockGetUsableOffered = jest.fn();

jest.mock('../../../src/payments/PaymentProviderRegistry', () => ({
  paymentProviderRegistry: {
    getUsableOffered: (...args: unknown[]) => mockGetUsableOffered(...args),
    has: (...args: unknown[]) => mockHas(...args),
    get: (...args: unknown[]) => mockGet(...args),
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

jest.mock('../../../src/services/systemConfigService', () => ({
  getPaymentsConfig: jest.fn(),
}));

import { getPaymentsConfig } from '../../../src/services/systemConfigService';
import {
  getCashPaymentProvider,
  listAssignableOnlineProviders,
  listPaymentProvidersForAdmin,
  memberCanPayOnline,
  resolveMemberOnlinePaymentProvider,
} from '../../../src/payments/getActivePaymentProvider';

function fakeProvider(
  id: string,
  opts: { usable?: boolean; offered?: boolean; environment?: 'testing' | 'production' } = {},
) {
  return {
    id,
    displayName: id,
    environment: opts.environment ?? 'testing',
    isUsable: () => opts.usable !== false,
    isOfferedForNewPayments: () => opts.offered !== false,
  };
}

describe('resolveMemberOnlinePaymentProvider / memberCanPayOnline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentsConfig as jest.Mock).mockReturnValue({ installMode: 'test' });
  });

  it('resolves a valid assigned provider', () => {
    const dummy = fakeProvider('dummy');
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(dummy);
    expect(
      resolveMemberOnlinePaymentProvider({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: 'dummy',
      }),
    ).toBe(dummy);
  });

  it('throws when paymentProviderId missing', () => {
    expect(() =>
      resolveMemberOnlinePaymentProvider({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: null,
      }),
    ).toThrow(/assigned payment service/i);
  });

  it('throws when provider environment mismatches install mode', () => {
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(fakeProvider('stripe', { environment: 'production' }));
    expect(() =>
      resolveMemberOnlinePaymentProvider({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: 'stripe',
      }),
    ).toThrow(/install mode/i);
  });

  it('throws when provider is not usable', () => {
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(fakeProvider('dummy', { usable: false }));
    expect(() =>
      resolveMemberOnlinePaymentProvider({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: 'dummy',
      }),
    ).toThrow(/not available/i);
  });

  it('memberCanPayOnline requires email, consent, and valid provider', () => {
    const dummy = fakeProvider('dummy');
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(dummy);

    expect(
      memberCanPayOnline({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: 'dummy',
      }),
    ).toBe(true);
    expect(
      memberCanPayOnline({
        email: 'a@ex.com',
        onlinePayConsent: false,
        paymentProviderId: 'dummy',
      }),
    ).toBe(false);
    expect(
      memberCanPayOnline({
        email: null,
        onlinePayConsent: true,
        paymentProviderId: 'dummy',
      }),
    ).toBe(false);
    expect(
      memberCanPayOnline({
        email: 'a@ex.com',
        onlinePayConsent: true,
        paymentProviderId: null,
      }),
    ).toBe(false);
  });

  it('listAssignableOnlineProviders excludes cash and wrong environment', () => {
    mockGetUsableOffered.mockReturnValue([
      fakeProvider('cash'),
      fakeProvider('dummy'),
      fakeProvider('stripe', { environment: 'production' }),
    ]);
    expect(listAssignableOnlineProviders().map((p) => p.id)).toEqual(['dummy']);
  });

  it('getCashPaymentProvider requires registration', () => {
    mockHas.mockReturnValue(false);
    expect(() => getCashPaymentProvider()).toThrow(/Cash payment provider is not registered/);

    const cash = fakeProvider('cash');
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(cash);
    expect(getCashPaymentProvider()).toBe(cash);
  });

  it('listPaymentProvidersForAdmin marks assignableToMembers', () => {
    mockGetAll.mockReturnValue([
      fakeProvider('dummy'),
      fakeProvider('cash'),
      fakeProvider('stripe', { environment: 'production' }),
    ]);
    expect(listPaymentProvidersForAdmin()).toEqual([
      expect.objectContaining({ id: 'dummy', assignableToMembers: true }),
      expect.objectContaining({ id: 'cash', assignableToMembers: false }),
      expect.objectContaining({ id: 'stripe', assignableToMembers: false }),
    ]);
  });
});
