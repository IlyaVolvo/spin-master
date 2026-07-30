/**
 * Payment feature — active online provider selection (excludes cash)
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
  getSystemConfig: jest.fn(),
}));

import { getSystemConfig } from '../../../src/services/systemConfigService';
import {
  getActivePaymentProvider,
  getCashPaymentProvider,
  listPaymentProvidersForAdmin,
} from '../../../src/payments/getActivePaymentProvider';

function fakeProvider(id: string, usable = true, offered = true) {
  return {
    id,
    displayName: id,
    isUsable: () => usable,
    isOfferedForNewPayments: () => offered,
  };
}

describe('getActivePaymentProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when no online providers are available', () => {
    mockGetUsableOffered.mockReturnValue([fakeProvider('cash')]);
    expect(() => getActivePaymentProvider()).toThrow(/No usable online payment provider/);
  });

  it('uses configured online provider when usable', () => {
    const test = fakeProvider('test');
    mockGetUsableOffered.mockReturnValue([test, fakeProvider('other')]);
    (getSystemConfig as jest.Mock).mockReturnValue({ payments: { providerId: 'test' } });
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(test);

    expect(getActivePaymentProvider()).toBe(test);
  });

  it('ignores configured cash and falls back to sole online provider', () => {
    const test = fakeProvider('test');
    mockGetUsableOffered.mockReturnValue([test]);
    (getSystemConfig as jest.Mock).mockReturnValue({ payments: { providerId: 'cash' } });

    expect(getActivePaymentProvider()).toBe(test);
  });

  it('throws when multiple online providers and config is ambiguous', () => {
    mockGetUsableOffered.mockReturnValue([fakeProvider('a'), fakeProvider('b')]);
    (getSystemConfig as jest.Mock).mockReturnValue({ payments: { providerId: '' } });
    mockHas.mockReturnValue(false);

    expect(() => getActivePaymentProvider()).toThrow(/Multiple payment providers/);
  });

  it('getCashPaymentProvider requires registration', () => {
    mockHas.mockReturnValue(false);
    expect(() => getCashPaymentProvider()).toThrow(/Cash payment provider is not registered/);

    const cash = fakeProvider('cash');
    mockHas.mockReturnValue(true);
    mockGet.mockReturnValue(cash);
    expect(getCashPaymentProvider()).toBe(cash);
  });

  it('lists providers for admin', () => {
    mockGetAll.mockReturnValue([fakeProvider('cash'), fakeProvider('test', false, true)]);
    expect(listPaymentProvidersForAdmin()).toEqual([
      { id: 'cash', displayName: 'cash', usable: true, offered: true },
      { id: 'test', displayName: 'test', usable: false, offered: true },
    ]);
  });
});
