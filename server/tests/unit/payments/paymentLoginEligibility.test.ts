/**
 * Payment login eligibility (email + password required for Pay now / unlock)
 */
import { memberHasPaymentLogin } from '../../../src/utils/paymentLoginEligibility';

describe('memberHasPaymentLogin', () => {
  it('is true when email and password are both set', () => {
    expect(
      memberHasPaymentLogin({ email: 'adam@a.com', password: '$2a$10$hashed' }),
    ).toBe(true);
  });

  it('is false when email is missing or blank', () => {
    expect(memberHasPaymentLogin({ email: null, password: 'x' })).toBe(false);
    expect(memberHasPaymentLogin({ email: '   ', password: 'x' })).toBe(false);
    expect(memberHasPaymentLogin({ password: 'x' })).toBe(false);
  });

  it('is false when password is empty (invite / reset state)', () => {
    expect(memberHasPaymentLogin({ email: 'a@b.com', password: '' })).toBe(false);
    expect(memberHasPaymentLogin({ email: 'a@b.com', password: null })).toBe(false);
  });
});
