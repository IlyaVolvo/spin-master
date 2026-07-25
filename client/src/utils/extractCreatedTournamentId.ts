/** Extract a tournament id from common create/finalize API response shapes. */
export function extractCreatedTournamentId(data: unknown): number | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  if (typeof obj.id === 'number' && Number.isFinite(obj.id)) return obj.id;
  const nested = obj.tournament;
  if (nested && typeof nested === 'object') {
    const id = (nested as Record<string, unknown>).id;
    if (typeof id === 'number' && Number.isFinite(id)) return id;
  }
  if (Array.isArray(obj.tournaments) && obj.tournaments[0] && typeof obj.tournaments[0] === 'object') {
    const id = (obj.tournaments[0] as Record<string, unknown>).id;
    if (typeof id === 'number' && Number.isFinite(id)) return id;
  }
  return undefined;
}
