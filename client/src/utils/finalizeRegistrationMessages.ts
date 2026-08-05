export function buildFinalizeSuccessMessage(
  baseMessage: string,
  data: { warnings?: unknown },
): string {
  const warnings = Array.isArray(data?.warnings)
    ? data.warnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];
  if (warnings.length === 0) return baseMessage;
  return `${baseMessage} ${warnings.join(' ')}`;
}
