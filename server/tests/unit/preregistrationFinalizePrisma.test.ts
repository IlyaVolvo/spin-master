import { createPreregistrationFinalizePrisma } from '../../src/utils/preregistrationFinalizePrisma';

describe('createPreregistrationFinalizePrisma', () => {
  it('rewrites the first create as update and leaves later creates on the real create', async () => {
    const originalCreate = jest.fn(async (args: any) => ({ id: 99, via: 'create', ...args?.data }));
    const update = jest.fn(async (args: any) => ({ id: args.where.id, via: 'update', ...args.data }));
    const findUnique = jest.fn();

    const prisma: any = {
      tournament: {
        create: originalCreate,
        update,
        findUnique,
      },
      match: { deleteMany: jest.fn() },
    };

    // Capture identity before wrapping — must stay the same after (no pollution).
    const createBefore = prisma.tournament.create;
    const pluginPrisma = createPreregistrationFinalizePrisma(prisma, 42);

    const first = await pluginPrisma.tournament.create({
      data: { name: 'Parent', type: 'MULTI_ROUND_ROBINS', status: 'ACTIVE', participants: { create: [] } },
      include: { participants: true },
    });
    expect(first).toEqual(expect.objectContaining({ id: 42, via: 'update', status: 'ACTIVE', name: 'Parent' }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(originalCreate).not.toHaveBeenCalled();
    expect(prisma.tournament.create).toBe(createBefore);

    const second = await pluginPrisma.tournament.create({
      data: { name: 'Child', type: 'ROUND_ROBIN', status: 'ACTIVE' },
    });
    expect(second).toEqual(expect.objectContaining({ id: 99, via: 'create', name: 'Child' }));
    expect(originalCreate).toHaveBeenCalledTimes(1);
    expect(prisma.tournament.create).toBe(createBefore);

    // Other tournament methods still forward
    await pluginPrisma.tournament.findUnique({ where: { id: 42 } });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 42 } });

    // Non-tournament models still forward
    await pluginPrisma.match.deleteMany({ where: { tournamentId: 1 } });
    expect(prisma.match.deleteMany).toHaveBeenCalled();
  });

  it('does not mutate the underlying prisma.tournament.create reference', async () => {
    const freshCreate = jest.fn(async () => ({ id: 2 }));
    const freshPrisma: any = {
      tournament: {
        create: freshCreate,
        update: jest.fn(async (args: any) => ({ id: args.where.id, updated: true })),
      },
    };
    const before = freshPrisma.tournament.create;
    const wrapped = createPreregistrationFinalizePrisma(freshPrisma, 7);
    await wrapped.tournament.create({ data: { name: 'x', status: 'ACTIVE' } });
    await wrapped.tournament.create({ data: { name: 'y', status: 'ACTIVE' } });
    expect(freshPrisma.tournament.create).toBe(before);
    expect(freshCreate).toHaveBeenCalledTimes(1);
  });
});
