import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeedbackContext,
  FeedbackTag,
  FeedbackVisibility,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import {
  isSafeFeedbackResourceUrl,
  sanitizeFeedbackContent,
  sanitizeFeedbackHtml,
} from './content-sanitizer';

const feedbackInclude = {
  author: { select: { id: true, name: true } },
  resources: {
    select: {
      id: true,
      title: true,
      url: true,
      type: true,
      description: true,
      createdAt: true,
    },
  },
} satisfies Prisma.FeedbackPostInclude;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMember(userId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.USER },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Member access required');
    return member;
  }

  private sanitizeContent(content: string) {
    return sanitizeFeedbackContent(content);
  }

  private validateAudience(dto: CreateFeedbackDto) {
    if (dto.visibility === FeedbackVisibility.DIRECT) {
      if (!dto.targetUserId || dto.groupId) {
        throw new BadRequestException(
          'DIRECT feedback requires only targetUserId',
        );
      }
    } else if (dto.visibility === FeedbackVisibility.GROUP) {
      if (!dto.groupId || dto.targetUserId) {
        throw new BadRequestException('GROUP feedback requires only groupId');
      }
    } else if (dto.groupId || dto.targetUserId) {
      throw new BadRequestException(
        'ALL feedback cannot target a member or group',
      );
    }
    if (dto.resource && !isSafeFeedbackResourceUrl(dto.resource.url)) {
      throw new BadRequestException('Resource URL must use HTTPS');
    }
  }

  private async buildData(authorId: string, dto: CreateFeedbackDto) {
    this.validateAudience(dto);
    if (dto.visibility === FeedbackVisibility.DIRECT) {
      const target = await this.prisma.user.findFirst({
        where: { id: dto.targetUserId!, role: UserRole.USER },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Member not found');
    }
    if (dto.visibility === FeedbackVisibility.GROUP) {
      const group = await this.prisma.group.findUnique({
        where: { id: dto.groupId! },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Group not found');
    }
    return {
      authorId,
      title: dto.title.trim(),
      content: this.sanitizeContent(dto.content),
      visibility: dto.visibility,
      targetUserId:
        dto.visibility === FeedbackVisibility.DIRECT ? dto.targetUserId : null,
      groupId: dto.visibility === FeedbackVisibility.GROUP ? dto.groupId : null,
      context: dto.context ?? FeedbackContext.GENERAL,
      tags: [...new Set(dto.tags ?? [])] as FeedbackTag[],
      resource: dto.resource,
    };
  }

  private async createResource(
    tx: Prisma.TransactionClient,
    feedbackId: string,
    resource: CreateFeedbackDto['resource'],
  ) {
    if (!resource) return;
    await tx.feedbackResource.create({
      data: {
        feedbackId,
        title: resource.title.trim(),
        url: resource.url,
        type: resource.type?.trim() || null,
        description: resource.description?.trim() || null,
      },
    });
  }

  private present(
    post: Prisma.FeedbackPostGetPayload<{ include: typeof feedbackInclude }> & {
      reads?: { userId: string; readAt: Date }[];
    },
    userId?: string,
  ) {
    return {
      id: post.id,
      title: post.title,
      content: sanitizeFeedbackHtml(post.content),
      visibility: post.visibility,
      audience: post.visibility,
      context: post.context,
      tags: post.tags,
      author: post.author,
      resources: post.resources,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      archivedAt: post.archivedAt,
      isRead: userId
        ? (post.reads?.some((read) => read.userId === userId) ?? false)
        : undefined,
      readAt: userId
        ? (post.reads?.find((read) => read.userId === userId)?.readAt ?? null)
        : undefined,
    };
  }

  async create(authorId: string, dto: CreateFeedbackDto) {
    const author = await this.prisma.user.findFirst({
      where: { id: authorId, role: UserRole.ADMIN },
      select: { id: true },
    });
    if (!author) throw new ForbiddenException('Administrator access required');
    const data = await this.buildData(authorId, dto);
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.feedbackPost.create({
        data: {
          authorId: data.authorId,
          title: data.title,
          content: data.content,
          visibility: data.visibility,
          targetUserId: data.targetUserId,
          groupId: data.groupId,
          context: data.context,
          tags: data.tags,
        },
      });
      await this.createResource(tx, created.id, data.resource);
      return tx.feedbackPost.findUniqueOrThrow({
        where: { id: created.id },
        include: feedbackInclude,
      });
    });
    return this.present(post);
  }

  async update(id: string, dto: UpdateFeedbackDto) {
    const existing = await this.prisma.feedbackPost.findFirst({
      where: { id, archivedAt: null },
      include: { resources: true },
    });
    if (!existing) throw new NotFoundException('Feedback not found');
    const complete: CreateFeedbackDto = {
      title: dto.title ?? existing.title,
      content: dto.content ?? existing.content,
      visibility: dto.visibility ?? existing.visibility,
      targetUserId:
        dto.targetUserId === undefined
          ? existing.targetUserId
          : dto.targetUserId,
      groupId: dto.groupId === undefined ? existing.groupId : dto.groupId,
      context: dto.context ?? existing.context,
      tags: dto.tags ?? existing.tags,
      resource:
        dto.resource === undefined
          ? (existing.resources[0] ?? null)
          : dto.resource,
    };
    const data = await this.buildData(existing.authorId, complete);
    const post = await this.prisma.$transaction(async (tx) => {
      if (dto.resource !== undefined) {
        await tx.feedbackResource.deleteMany({ where: { feedbackId: id } });
        await this.createResource(tx, id, data.resource);
      }
      return tx.feedbackPost.update({
        where: { id },
        data: {
          title: data.title,
          content: data.content,
          visibility: data.visibility,
          targetUserId: data.targetUserId,
          groupId: data.groupId,
          context: data.context,
          tags: data.tags,
        },
        include: feedbackInclude,
      });
    });
    return this.present(post);
  }

  async archive(id: string) {
    const result = await this.prisma.feedbackPost.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Feedback not found');
    return { success: true };
  }

  private async authorizedWhere(userId: string, scope: 'for-you' | 'shared') {
    const member = await this.assertMember(userId);
    if (scope === 'for-you') {
      return { visibility: FeedbackVisibility.DIRECT, targetUserId: member.id };
    }
    return {
      OR: [
        { visibility: FeedbackVisibility.ALL },
        {
          visibility: FeedbackVisibility.GROUP,
          group: { is: { memberships: { some: { userId: member.id } } } },
        },
      ],
    } satisfies Prisma.FeedbackPostWhereInput;
  }

  async listForMember(userId: string, query: FeedbackQueryDto) {
    const scope = query.scope ?? 'shared';
    const limit = Math.min(50, Math.max(1, Math.floor(query.limit) || 20));
    const page = Math.max(1, Math.floor(query.page) || 1);
    const where: Prisma.FeedbackPostWhereInput = {
      ...(await this.authorizedWhere(userId, scope)),
      archivedAt: null,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.feedbackPost.findMany({
        where,
        include: {
          ...feedbackInclude,
          reads: { where: { userId }, select: { userId: true, readAt: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.feedbackPost.count({ where }),
    ]);
    return {
      items: items.map((post) => this.present(post, userId)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async findAuthorized(userId: string, id: string) {
    const member = await this.assertMember(userId);
    const post = await this.prisma.feedbackPost.findFirst({
      where: {
        id,
        archivedAt: null,
        OR: [
          { visibility: FeedbackVisibility.DIRECT, targetUserId: userId },
          { visibility: FeedbackVisibility.ALL },
          {
            visibility: FeedbackVisibility.GROUP,
            group: { is: { memberships: { some: { userId: member.id } } } },
          },
        ],
      },
      include: {
        ...feedbackInclude,
        reads: { where: { userId }, select: { userId: true, readAt: true } },
      },
    });
    if (!post) throw new NotFoundException('Feedback not found');
    return post;
  }

  async getForMember(userId: string, id: string) {
    return this.present(await this.findAuthorized(userId, id), userId);
  }

  async markRead(userId: string, id: string) {
    await this.findAuthorized(userId, id);
    const read = await this.prisma.feedbackRead.upsert({
      where: { feedbackId_userId: { feedbackId: id, userId } },
      create: { feedbackId: id, userId },
      update: { readAt: new Date() },
      select: { feedbackId: true, userId: true, readAt: true },
    });
    return { success: true, ...read };
  }

  async unreadCount(userId: string) {
    const [forYou, shared] = await Promise.all([
      this.unreadForScope(userId, 'for-you'),
      this.unreadForScope(userId, 'shared'),
    ]);
    return { unreadCount: forYou + shared, forYou, shared };
  }

  private async unreadForScope(userId: string, scope: 'for-you' | 'shared') {
    const where: Prisma.FeedbackPostWhereInput = {
      ...(await this.authorizedWhere(userId, scope)),
      archivedAt: null,
      reads: { none: { userId } },
    };
    return this.prisma.feedbackPost.count({ where });
  }

  async dashboardSummary(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!currentUser) throw new NotFoundException('User not found');
    if (currentUser.role !== UserRole.USER) {
      return {
        unreadDirectFeedbackCount: 0,
        unreadSharedFeedbackCount: 0,
        latestDirectFeedback: null,
        latestSharedInsight: null,
      };
    }
    const [forYouUnreadCount, sharedUnreadCount, latestDirect, latestShared] =
      await Promise.all([
        this.unreadForScope(userId, 'for-you'),
        this.unreadForScope(userId, 'shared'),
        this.latestForScope(userId, 'for-you'),
        this.latestForScope(userId, 'shared'),
      ]);
    return {
      unreadDirectFeedbackCount: forYouUnreadCount,
      unreadSharedFeedbackCount: sharedUnreadCount,
      latestDirectFeedback: latestDirect,
      latestSharedInsight: latestShared,
    };
  }

  private async latestForScope(userId: string, scope: 'for-you' | 'shared') {
    const where: Prisma.FeedbackPostWhereInput = {
      ...(await this.authorizedWhere(userId, scope)),
      archivedAt: null,
    };
    const post = await this.prisma.feedbackPost.findFirst({
      where,
      include: {
        ...feedbackInclude,
        reads: { where: { userId }, select: { userId: true, readAt: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    if (!post) return null;
    const presented = this.present(post, userId);
    return {
      id: presented.id,
      title: presented.title,
      visibility: presented.visibility,
      context: presented.context,
      tags: presented.tags,
      author: presented.author,
      publishedAt: presented.publishedAt,
      isRead: presented.isRead,
    };
  }

  async listForAdmin(query: AdminFeedbackQueryDto) {
    const limit = Math.min(50, Math.max(1, Math.floor(query.limit) || 20));
    const page = Math.max(1, Math.floor(query.page) || 1);
    const where: Prisma.FeedbackPostWhereInput =
      query.archived === 'true'
        ? { archivedAt: { not: null } }
        : { archivedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.feedbackPost.findMany({
        where,
        include: feedbackInclude,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.feedbackPost.count({ where }),
    ]);
    return {
      items: items.map((post) => this.present(post)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getForAdmin(id: string) {
    const post = await this.prisma.feedbackPost.findUnique({
      where: { id },
      include: feedbackInclude,
    });
    if (!post) throw new NotFoundException('Feedback not found');
    return this.present(post);
  }
}
