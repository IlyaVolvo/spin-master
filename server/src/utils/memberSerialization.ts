/**
 * Strip secrets before sending member records over the API or sockets.
 */
export function stripSensitiveMemberFields<
  T extends { password?: string; qrTokenHash?: string | null; scorePin?: string | null }
>(member: T) {
  const { password, qrTokenHash, scorePin, ...memberWithoutSensitiveFields } = member;
  return memberWithoutSensitiveFields;
}

/** Normalize a member field value for audit comparison/logging. */
function auditFieldValue(field: string, value: unknown): unknown {
  if (field === 'picture') return Boolean(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value;
  if (value === undefined) return null;
  return value ?? null;
}

export type MemberLifecycleChangeEntry = {
  field: string;
  from: unknown;
  to: unknown;
  secret?: boolean;
};

const LIFECYCLE_SECRET_FIELDS = new Set(['password', 'scorePin']);

/** Mask secret credential values for membership lifecycle logs. */
export function maskLifecycleSecretValue(
  field: 'password' | 'scorePin',
  value: unknown,
): string {
  if (field === 'password') {
    if (typeof value === 'string' && value.length > 0) {
      return '*'.repeat(8);
    }
    return '(none)';
  }
  if (typeof value === 'string' && value.length > 0) {
    return '*'.repeat(value.length);
  }
  return '(none)';
}

export function memberLifecycleSecretChange(
  field: 'password' | 'scorePin',
  beforeValue: unknown,
  afterValue: unknown,
): MemberLifecycleChangeEntry {
  return {
    field,
    from: maskLifecycleSecretValue(field, beforeValue),
    to: maskLifecycleSecretValue(field, afterValue),
    secret: true,
  };
}

/** Convert profile PATCH audit map to lifecycle change rows. */
export function memberLifecycleChangesFromAudit(
  updateData: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): MemberLifecycleChangeEntry[] {
  const audit = memberChangedFieldsAudit(updateData, before, after);
  return Object.entries(audit).map(([field, { from, to }]) => ({
    field,
    from,
    to,
    secret: LIFECYCLE_SECRET_FIELDS.has(field),
  }));
}

/** Non-sensitive before/after map for fields present in updateData. */
export function memberChangedFieldsAudit(
  updateData: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of Object.keys(updateData)) {
    if (
      field === 'password' ||
      field === 'qrTokenHash' ||
      field === 'scorePin' ||
      field === 'passwordResetToken' ||
      field === 'passwordResetTokenExpiry'
    ) {
      continue;
    }
    const logField = field === 'picture' ? 'hasPicture' : field;
    const from = auditFieldValue(field, before[field]);
    const to = auditFieldValue(field, after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[logField] = { from, to };
    }
  }
  return changes;
}

/** Non-sensitive member fields for INFO audit logs (create). */
export function memberAuditLogFields(member: {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  gender?: string | null;
  birthDate?: Date | string | null;
  rating?: number | null;
  roles?: unknown;
  isActive?: boolean;
  phone?: string | null;
  address?: string | null;
  picture?: string | null;
  tournamentNotificationsEnabled?: boolean;
  autoRelinquishPrivileges?: boolean | null;
  emailConfirmedAt?: Date | string | null;
  mustResetPassword?: boolean;
}) {
  return {
    memberId: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email ?? null,
    gender: member.gender ?? null,
    birthDate: auditFieldValue('birthDate', member.birthDate),
    rating: member.rating ?? null,
    roles: member.roles,
    isActive: member.isActive,
    phone: member.phone ?? null,
    address: member.address ?? null,
    hasPicture: Boolean(member.picture),
    tournamentNotificationsEnabled: member.tournamentNotificationsEnabled,
    autoRelinquishPrivileges: member.autoRelinquishPrivileges ?? null,
    emailConfirmed: Boolean(member.emailConfirmedAt),
    mustResetPassword: member.mustResetPassword,
  };
}
