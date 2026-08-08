/**
 * Payment feature — online provider selection (installMode + no global providerId)
 */
const mockGetUsableOffered = jest.fn();
const mockHas = jest.fn();
const mockGet = jest.fn();
const mockGetAll = jest.fn();

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
  getActivePaymentProvider,
  getCashPaymentProvider,
  listAssignableOnlineProviders,
  listPaymentProvidersForAdmin,
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

describe('getActivePaymentProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPaymentsConfig as jest.Mock).mockReturnValue({ installMode: 'test' });
  });

  it('throws when no online providers match install mode', () => {
    mockGetUsableOffered.mockReturnValue([
      fakeProvider('cash'),
      fakeProvider('stripe', { environment: 'production' }),
    ]);
    expect(() => getActivePaymentProvider()).toThrow(/No usable online payment provider/);
  });

  it('uses sole matching online provider', () => {
    const dummy = fakeProvider('dummy');
    mockGetUsableOffered.mockReturnValue([dummy, fakeProvider('cash')]);
    expect(getActivePaymentProvider()).toBe(dummy);
  });

  it('throws when multiple matching online providers (need per-member assignment)', () => {
    mockGetUsableOffered.mockReturnValue([
      fakeProvider('dummy'),
      fakeProvider('stripe-test', { environment: 'testing' }),
    ]);
    expect(() => getActivePaymentProvider()).toThrow(/Member\.paymentProviderId/);
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
