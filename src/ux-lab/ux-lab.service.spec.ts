import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UxLabService } from './ux-lab.service';
import { stableArm, SECTION_REGISTRY } from './registry';
const uid = '27000000-0000-4000-8000-000000000001';
function database() {
  const db: any = {
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ role: 'USER', membership: { groupId: 'g1' } }),
      count: jest.fn().mockResolvedValue(0),
    },
    group: { count: jest.fn().mockResolvedValue(0) },
    uxLabRelease: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    uxLabExperiment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      create: jest.fn(),
    },
    uxLabAssignment: { upsert: jest.fn(), findUnique: jest.fn() },
    uxLabEvent: {
      findFirst: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn(),
  };
  db.$transaction = (cb: any) => cb(db);
  return db;
}
describe('Section experiment safety', () => {
  test('baseline A is independent for every section', async () => {
    const db = database(),
      s = new UxLabService(db);
    const a = await s.assignment(uid);
    expect(Object.keys(a.sections)).toHaveLength(SECTION_REGISTRY.length);
    expect(Object.values(a.sections).every((x) => x.version === 'A')).toBe(
      true,
    );
  });
  test('hash assignment is stable and approximately allocated', () => {
    expect(stableArm('test', uid, 50)).toBe(stableArm('test', uid, 50));
    const b = Array.from({ length: 1000 }, (_, i) =>
      stableArm('test', String(i), 50),
    ).filter((x) => x === 'B').length;
    expect(b).toBeGreaterThan(440);
    expect(b).toBeLessThan(560);
  });
  test('admins never enroll in experiments', async () => {
    const db = database();
    db.user.findUniqueOrThrow.mockResolvedValue({
      role: 'ADMIN',
      membership: null,
    });
    const result = await new UxLabService(db).assignment(uid);
    expect(result.excluded).toBe(true);
    expect(db.uxLabExperiment.findMany).not.toHaveBeenCalled();
  });
  test('group audience cannot enroll someone outside the group', async () => {
    const db = database();
    db.uxLabExperiment.findMany.mockResolvedValue([
      {
        id: 'e1',
        section: 'members-progress',
        audience: 'GROUPS',
        groupIds: ['other'],
        userIds: [],
        assignments: [],
      },
    ]);
    await new UxLabService(db).assignment(uid);
    expect(db.uxLabAssignment.upsert).not.toHaveBeenCalled();
  });
  test('prior enrolled user retains the same arm after membership moves', async () => {
    const db = database();
    db.uxLabExperiment.findMany.mockResolvedValue([
      {
        id: 'e1',
        section: 'members-progress',
        audience: 'GROUPS',
        groupIds: ['other'],
        userIds: [],
        allocation: 50,
        assignments: [{ version: 'B' }],
      },
    ]);
    db.uxLabAssignment.upsert.mockResolvedValue({ version: 'B' });
    const result = await new UxLabService(db).assignment(uid);
    expect(result.sections['members-progress'].version).toBe('B');
    expect(db.uxLabAssignment.upsert.mock.calls[0][0].update).toEqual({});
  });
  test('cannot test a section without a real B implementation', async () => {
    const db = database();
    await expect(
      new UxLabService(db).create(uid, {
        section: 'profile',
        title: 'Test',
        hypothesis: 'A valid hypothesis',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
  test('rejects empty research plans', async () => {
    await expect(
      new UxLabService(database()).create(uid, {
        title: '   ',
        hypothesis: '             ',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });
  test('cannot publish with a stale release revision', async () => {
    const db = database();
    await expect(
      new UxLabService(db).publish(uid, 'members-progress', {
        version: 'B',
        expectedContext: 'stale',
      }),
    ).rejects.toThrow(ConflictException);
    expect(db.uxLabRelease.create).not.toHaveBeenCalled();
  });
  test('cannot publish while the section has an active or paused experiment', async () => {
    const db = database();
    db.uxLabExperiment.count.mockResolvedValue(1);
    await expect(
      new UxLabService(db).publish(uid, 'members-progress', {
        version: 'B',
        expectedContext: 'baseline-20261027:members-progress',
      }),
    ).rejects.toThrow(ConflictException);
  });
  test('completed experiment cannot be restarted', async () => {
    const db = database(),
      e = { section: 'members-progress', status: 'COMPLETED' };
    db.uxLabExperiment.findUnique.mockResolvedValue(e);
    db.uxLabExperiment.findUniqueOrThrow.mockResolvedValue(e);
    await expect(
      new UxLabService(db).transition('e', 'RUNNING'),
    ).rejects.toThrow(ConflictException);
  });
  test('rejects action from a different section before any writes', async () => {
    const db = database();
    await expect(
      new UxLabService(db).record(uid, {
        accountId: uid,
        events: [{ section: 'profile', name: 'member_detail_loaded' }],
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(db.uxLabEvent.createMany).not.toHaveBeenCalled();
  });
  test('late telemetry cannot cross account boundaries', async () => {
    const db = database();
    await expect(
      new UxLabService(db).record(uid, {
        accountId: 'another-account',
        events: [],
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.uxLabEvent.createMany).not.toHaveBeenCalled();
  });
  test('actions without a prior exposure are not counted', async () => {
    const db = database();
    db.uxLabEvent.findFirst.mockResolvedValue(null);
    const r = await new UxLabService(db).record(uid, {
      accountId: uid,
      events: [
        {
          id: 'x',
          sessionId: 's',
          section: 'profile',
          version: 'A',
          context: 'baseline-20261027:profile',
          name: 'profile_saved',
        },
      ],
    });
    expect(r.accepted).toBe(0);
    expect(db.uxLabEvent.createMany).not.toHaveBeenCalled();
  });
  test('preview-only home cannot publish, create experiments, enroll users or restore a stale release', async () => {
    const db = database(),
      service = new UxLabService(db);
    db.uxLabRelease.findMany.mockResolvedValue([
      { section: 'home', version: 'B', id: 'stale', createdAt: new Date() },
    ]);
    db.uxLabExperiment.findMany.mockResolvedValue([
      {
        section: 'home',
        id: 'stale-experiment',
        assignments: [],
        audience: 'ALL',
      },
    ]);
    const result = await service.assignment(uid);
    expect(result.sections.home.version).toBe('A');
    expect(db.uxLabAssignment.upsert).not.toHaveBeenCalled();
    await expect(
      service.create(uid, { section: 'home' } as any),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.publish(uid, 'home', {
        version: 'B',
        expectedContext: 'baseline',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(db.uxLabExperiment.create).not.toHaveBeenCalled();
    expect(db.uxLabRelease.create).not.toHaveBeenCalled();
  });

  test('preview-only home rejects both stale activation and ordinary-user telemetry', async () => {
    const db = database(),
      service = new UxLabService(db);
    db.uxLabExperiment.findUnique.mockResolvedValue({
      section: 'home',
      status: 'DRAFT',
    });
    db.uxLabExperiment.findUniqueOrThrow.mockResolvedValue({
      section: 'home',
      status: 'DRAFT',
    });
    await expect(service.transition('stale', 'RUNNING')).rejects.toThrow(
      BadRequestException,
    );
    expect(db.uxLabExperiment.update).not.toHaveBeenCalled();
    await expect(
      service.record(uid, {
        accountId: uid,
        events: [
          { section: 'home', version: 'B', name: 'view', context: 'preview' },
        ],
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(db.uxLabEvent.createMany).not.toHaveBeenCalled();
  });
});
