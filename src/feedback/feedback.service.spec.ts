import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackContext, FeedbackVisibility, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackService } from './feedback.service';

jest.mock('./content-sanitizer', () => ({
  isSafeFeedbackResourceUrl: (value: string) => value.startsWith('https://'),
  sanitizeFeedbackContent: (value: string) => value,
  sanitizeFeedbackHtml: (value: string) => value,
}));

describe('FeedbackService', () => {
  const prisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    group: { findUnique: jest.fn() },
    feedbackPost: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    feedbackRead: { upsert: jest.fn() },
    $transaction: jest.fn((queries: unknown) =>
      Array.isArray(queries)
        ? Promise.all(queries)
        : (queries as () => unknown)(),
    ),
  };
  const service = new FeedbackService(prisma as unknown as PrismaService);
  const memberId = '04d53dae-17b7-4d85-96e2-45bf74b43d6e';
  const postId = 'a61fc733-dd16-48fc-9531-30d4bd499974';

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ id: memberId });
    prisma.feedbackPost.findMany.mockResolvedValue([]);
    prisma.feedbackPost.count.mockResolvedValue(0);
  });

  it('returns only direct posts addressed to the current member in For You', async () => {
    await service.listForMember(memberId, {
      scope: 'for-you',
      page: 1,
      limit: 20,
    });
    const where = prisma.feedbackPost.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      visibility: FeedbackVisibility.DIRECT,
      targetUserId: memberId,
      archivedAt: null,
    });
  });

  it('limits Shared to general posts and groups the member currently belongs to', async () => {
    await service.listForMember(memberId, {
      scope: 'shared',
      page: 1,
      limit: 20,
    });
    const where = prisma.feedbackPost.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { visibility: FeedbackVisibility.ALL },
      {
        visibility: FeedbackVisibility.GROUP,
        group: { is: { memberships: { some: { userId: memberId } } } },
      },
    ]);
    expect(where.archivedAt).toBeNull();
  });

  it('paginates without loading the full feedback history', async () => {
    await service.listForMember(memberId, {
      scope: 'shared',
      page: 3,
      limit: 12,
    });
    expect(prisma.feedbackPost.findMany.mock.calls[0][0]).toMatchObject({
      skip: 24,
      take: 12,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('rechecks detail access and hides unauthorized or archived posts', async () => {
    prisma.feedbackPost.findFirst.mockResolvedValue(null);
    await expect(service.getForMember(memberId, postId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.feedbackPost.findFirst.mock.calls[0][0].where).toMatchObject({
      id: postId,
      archivedAt: null,
    });
  });

  it('marks authorized posts read idempotently', async () => {
    prisma.feedbackPost.findFirst.mockResolvedValue({ id: postId });
    prisma.feedbackRead.upsert.mockResolvedValue({
      feedbackId: postId,
      userId: memberId,
      readAt: new Date(),
    });
    await service.markRead(memberId, postId);
    expect(prisma.feedbackRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feedbackId_userId: { feedbackId: postId, userId: memberId } },
        create: { feedbackId: postId, userId: memberId },
      }),
    );
  });

  it('rejects members attempting to publish mentor feedback', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.create(memberId, {
        title: 'Guidance',
        content: '<p>Keep learning</p>',
        visibility: FeedbackVisibility.ALL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid audience combinations and missing audiences', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: memberId });
    await expect(
      service.create(memberId, {
        title: 'Private',
        content: 'Text',
        visibility: FeedbackVisibility.DIRECT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
  });

  it('returns a short dashboard bridge rather than full feed content', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: UserRole.USER });
    prisma.feedbackPost.findFirst.mockResolvedValue(null);
    const result = await service.dashboardSummary(memberId);
    expect(result).toEqual({
      unreadDirectFeedbackCount: 0,
      unreadSharedFeedbackCount: 0,
      latestDirectFeedback: null,
      latestSharedInsight: null,
    });
    expect(prisma.feedbackPost.count).toHaveBeenCalledTimes(2);
  });

  it('uses language independent context enums', () => {
    expect(FeedbackContext.APPLICATION).toBe('APPLICATION');
    expect(FeedbackContext.GENERAL).toBe('GENERAL');
  });
});
