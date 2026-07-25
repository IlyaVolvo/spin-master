/**
 * Ensure tournament names are unique when auto-generated (or otherwise colliding).
 * If `proposedName` is already used, append local clock time as ` HH:MM`.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local clock as HH:MM */
export function formatClockHhMm(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Local clock as HH:MM:SS (fallback when HH:MM is also taken) */
export function formatClockHhMmSs(date: Date = new Date()): string {
  return `${formatClockHhMm(date)}:${pad2(date.getSeconds())}`;
}

export function appendClockForUniqueness(baseName: string, date: Date = new Date()): string {
  return `${baseName} ${formatClockHhMm(date)}`;
}

type NameExistsFn = (name: string) => boolean | Promise<boolean>;

/**
 * Returns `proposedName` if unused; otherwise `proposedName HH:MM`.
 * If that is also taken, falls back to `proposedName HH:MM:SS`.
 * `reserved` tracks names already claimed in the same batch (e.g. multi-create).
 */
export async function ensureUniqueTournamentName(
  nameExists: NameExistsFn,
  proposedName: string,
  options?: { now?: Date; reserved?: Set<string> },
): Promise<string> {
  const now = options?.now ?? new Date();
  const reserved = options?.reserved;
  const base = proposedName.trim();
  if (!base) {
    return base;
  }

  const isTaken = async (name: string): Promise<boolean> => {
    if (reserved?.has(name)) return true;
    return !!(await nameExists(name));
  };

  if (!(await isTaken(base))) {
    reserved?.add(base);
    return base;
  }

  const withHm = appendClockForUniqueness(base, now);
  if (!(await isTaken(withHm))) {
    reserved?.add(withHm);
    return withHm;
  }

  const withHms = `${base} ${formatClockHhMmSs(now)}`;
  reserved?.add(withHms);
  return withHms;
}

/** Prisma-backed helper used by tournament routes. */
export async function ensureUniqueTournamentNameInDb(
  prismaClient: { tournament: { findFirst: (args: any) => Promise<{ id: number } | null> } },
  proposedName: string,
  options?: { now?: Date; reserved?: Set<string> },
): Promise<string> {
  return ensureUniqueTournamentName(
    async (name) => {
      const row = await prismaClient.tournament.findFirst({
        where: { name },
        select: { id: true },
      });
      return row != null;
    },
    proposedName,
    options,
  );
}
