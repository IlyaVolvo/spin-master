/**
 * Strip secrets before sending member records over the API or sockets.
 */
export function stripSensitiveMemberFields<
  T extends { password?: string; qrTokenHash?: string | null; scorePin?: string | null }
>(member: T) {
  const { password, qrTokenHash, scorePin, ...memberWithoutSensitiveFields } = member;
  return memberWithoutSensitiveFields;
}
