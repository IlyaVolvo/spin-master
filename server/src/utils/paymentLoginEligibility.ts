/**
 * Whether a member can unlock check-in payment with their own login password.
 * Requires both a non-empty email and a non-empty password hash.
 */
export function memberHasPaymentLogin(member: {
  email?: string | null;
  password?: string | null;
}): boolean {
  return Boolean(member.email?.trim() && member.password !== '' && member.password != null);
}
