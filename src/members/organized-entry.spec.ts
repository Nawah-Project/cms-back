import { enrollOrganizedEntry, specialtyKey } from './organized-entry';
function database() {
  let counter = 0;
  const assigned = new Map<string, any>();
  const db: any = {
    $queryRaw: jest.fn(),
    uxLabExperiment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'experiment' }),
      findUnique: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
      update: jest
        .fn()
        .mockImplementation(async () => ({ entrySequence: ++counter })),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          role: 'USER',
          membership: null,
          journeyState: {
            currentNodeCode: 'TASK_0',
            completedNodeCodes: [],
            isGroupUnlocked: false,
          },
        }),
    },
    uxLabAssignment: {
      findUnique: jest
        .fn()
        .mockImplementation(async (q) =>
          assigned.get(q.where.experimentId_userId.userId),
        ),
      create: jest.fn().mockImplementation(async (q) => {
        assigned.set(q.data.userId, q.data);
        return q.data;
      }),
    },
  };
  return { db, assigned };
}
describe('Organized journey entry', () => {
  test('A then B persists across repeated visits; deletion never rewinds counter', async () => {
    const { db, assigned } = database();
    expect((await enrollOrganizedEntry(db, 'one'))?.version).toBe('A');
    expect((await enrollOrganizedEntry(db, 'one'))?.version).toBe('A');
    expect((await enrollOrganizedEntry(db, 'two'))?.version).toBe('B');
    assigned.delete('one');
    expect((await enrollOrganizedEntry(db, 'three'))?.version).toBe('A');
    expect(db.uxLabExperiment.update).toHaveBeenCalledTimes(3);
  });
  test.each([
    { role: 'ADMIN' },
    { role: 'USER', membership: { id: 'g' } },
    {
      role: 'USER',
      journeyState: {
        currentNodeCode: 'W1_M1',
        completedNodeCodes: ['TASK_0'],
      },
    },
    {
      role: 'USER',
      journeyState: {
        currentNodeCode: 'TASK_0',
        completedNodeCodes: ['TASK_0'],
      },
    },
  ])('does not enroll excluded or progressed account %#', async (user) => {
    const { db } = database();
    db.user.findUnique.mockResolvedValue(user);
    expect(await enrollOrganizedEntry(db, 'one')).toBeUndefined();
    expect(db.uxLabExperiment.update).not.toHaveBeenCalled();
  });
  test('a concurrent pause blocks enrollment after the row lock', async () => {
    const { db } = database();
    db.uxLabExperiment.findUnique.mockResolvedValue({ status: 'PAUSED' });
    expect(await enrollOrganizedEntry(db, 'one')).toBeUndefined();
    expect(db.uxLabAssignment.create).not.toHaveBeenCalled();
  });
  test('specialty comparison normalizes case and spacing without merging unrelated specialties', () => {
    expect(specialtyKey('  UI/UX   Designer ')).toBe(
      specialtyKey('ui/ux designer'),
    );
    expect(specialtyKey('Software QA Engineer')).not.toBe(
      specialtyKey('UI/UX Designer'),
    );
  });
});
