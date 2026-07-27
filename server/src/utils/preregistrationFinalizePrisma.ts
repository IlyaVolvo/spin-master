/**
 * Prisma wrapper for finalizing a PRE_REGISTRATION tournament in place.
 *
 * The first `tournament.create` is rewritten as an update of the preregistration
 * row (status → ACTIVE). Later creates (e.g. compound child tournaments) use the
 * real create.
 *
 * IMPORTANT: Do not use Object.create + property assignment on Prisma model
 * delegates. Prisma exposes writable own properties via a Proxy; assigning
 * `create` on an Object.create child sets the property on the real delegate and
 * permanently hijacks `prisma.tournament.create`, which then recurses forever
 * when the wrapper tries to call through to the original create.
 */
export function createPreregistrationFinalizePrisma(
  prisma: any,
  preregistrationTournamentId: number,
): any {
  let rootCreateUsed = false;
  const tournament = prisma.tournament;
  const originalCreate = tournament.create.bind(tournament);

  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop === 'tournament') {
        return new Proxy(tournament, {
          get(tTarget, tProp) {
            if (tProp === 'create') {
              return async (args: any) => {
                if (rootCreateUsed) {
                  return originalCreate(args);
                }
                rootCreateUsed = true;
                return tTarget.update({
                  where: { id: preregistrationTournamentId },
                  data: {
                    ...args.data,
                    status: 'ACTIVE',
                  },
                  include: args.include,
                });
              };
            }
            const value = Reflect.get(tTarget, tProp, tTarget);
            return typeof value === 'function' ? value.bind(tTarget) : value;
          },
        });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
