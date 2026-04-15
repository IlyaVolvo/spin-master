/**
 * Strip secrets before sending member records over the API or sockets.
 */
export function stripSensitiveMemberFields<T extends { password?: string; qrTokenHash?: string | null }>(
  member: T
) {
  const { password, qrTokenHash, ...memberWithoutSensitiveFields } = member;
  return memberWithoutSensitiveFields;
}
