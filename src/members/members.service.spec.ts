/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembersService } from './members.service';

describe('MembersService', () => {
  let service: MembersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ groupId: 'group-a' }),
        findMany: jest.fn().mockResolvedValue([
          { userId: 'member-a', user: { name: 'A' } },
          { userId: 'member-b', user: { name: 'B' } },
        ]),
      },
      application: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { createdAt: null, updatedAt: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      applicationStageTransition: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { changedAt: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'member-a', name: 'A' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new MembersService(prisma as PrismaService);
  });

  it('returns only group members and sorts them by latest application or transition activity', async () => {
    prisma.membership.findMany
      .mockResolvedValueOnce([{ userId: 'member-a' }, { userId: 'member-b' }])
      .mockResolvedValueOnce([
        { userId: 'member-a', user: { name: 'A' } },
        { userId: 'member-b', user: { name: 'B' } },
      ]);
    prisma.application.groupBy
      .mockResolvedValueOnce([
        { userId: 'member-a', stage: 'APPLIED', _count: { _all: 1 } },
        { userId: 'member-b', stage: 'INTERVIEW', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        {
          userId: 'member-a',
          _max: {
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        },
        {
          userId: 'member-b',
          _max: {
            createdAt: new Date('2026-02-01'),
            updatedAt: new Date('2026-02-01'),
          },
        },
      ]);
    prisma.applicationStageTransition.groupBy.mockResolvedValue([
      { userId: 'member-a', _max: { changedAt: new Date('2026-03-01') } },
      { userId: 'member-b', _max: { changedAt: null } },
    ]);

    const result = await service.getProgress('member-a');

    expect(result.map(({ userId }) => userId)).toEqual([
      'member-a',
      'member-b',
    ]);
    expect(result[0].lastUpdatedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(result[1].lastUpdatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result[0].counts.applied).toBe(1);
    expect(result[0].avatar).toBeNull();
    expect(prisma.application.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['member-a', 'member-b'] } },
      }),
    );
  });

  it('uses Application.createdAt for new application activity and merges it with transitions newest first', async () => {
    prisma.applicationStageTransition.findMany.mockResolvedValue([
      {
        id: 'transition-id',
        userId: 'member-a',
        fromStage: 'APPLIED',
        toStage: 'INTERVIEW',
        outcome: null,
        changedAt: new Date('2026-04-02'),
        user: { id: 'member-a', name: 'A' },
        application: {
          id: 'app-b',
          companyName: 'Co B',
          jobTitle: 'Designer',
          jobUrl: null,
          applicationMethod: null,
        },
      },
    ]);
    prisma.application.findMany.mockResolvedValue([
      {
        id: 'app-a',
        userId: 'member-b',
        companyName: 'Co A',
        jobTitle: 'Engineer',
        jobUrl: 'https://job',
        applicationMethod: 'LINKEDIN',
        stage: 'APPLIED',
        outcome: 'NONE',
        createdAt: new Date('2026-04-03'),
        user: { id: 'member-b', name: 'B' },
      },
    ]);

    const result = await service.getActivity('member-a', 20);

    expect(result.map(({ id }) => id)).toEqual([
      'application:app-a',
      'transition:transition-id',
    ]);
    expect(result[0]).toMatchObject({
      memberId: 'member-b',
      fromStage: null,
      toStage: 'APPLIED',
      application: { id: 'app-a' },
    });
    expect(result[1]).toMatchObject({
      memberId: 'member-a',
      fromStage: 'APPLIED',
      toStage: 'INTERVIEW',
    });
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['member-a', 'member-b'] } },
      }),
    );
  });

  it('returns member application details and same-group shared-company members', async () => {
    prisma.application.aggregate.mockResolvedValue({
      _max: {
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      },
    });
    prisma.applicationStageTransition.aggregate.mockResolvedValue({
      _max: { changedAt: new Date('2026-01-03') },
    });
    prisma.application.findMany
      .mockResolvedValueOnce([
        {
          id: 'app-a',
          companyName: 'Same Co',
          jobTitle: 'Designer',
          applicationDate: '2026-01-01',
          location: null,
          applicationMethod: 'REFERRAL',
          jobUrl: null,
          stage: 'APPLIED',
          outcome: 'NONE',
          updatedAt: new Date('2026-01-02'),
        },
      ])
      .mockResolvedValueOnce([{ userId: 'member-b', companyName: 'Same Co' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'member-b', name: 'B' }]);

    const result = await service.getMemberDetail('member-a', 'member-a');

    expect(result.member.lastUpdatedAt).toBe('2026-01-03T00:00:00.000Z');
    expect(result.applications[0]).toMatchObject({
      sharedCompany: true,
      otherMembers: [{ id: 'member-b', name: 'B', avatar: null }],
    });
    expect(prisma.application.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: { in: ['member-b'] },
          companyName: { in: ['Same Co'] },
        },
      }),
    );
  });

  it('rejects access to members outside the authenticated user group', async () => {
    await expect(
      service.getMemberDetail('member-a', 'outside-member'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects users who do not belong to a group', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.getActivity('member-a')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
