import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EmailType,
  FeedbackContext,
  FeedbackTag,
  FeedbackVisibility,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSenderService } from '../auth/email-sender.service';
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
import { cvFoundationStatus, CV_FOUNDATION_CODE } from '../journey-engine/cv-foundation.util';
import { JOURNEY_GUIDANCE_CATALOG } from './journey-guidance.catalog';

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
export class FeedbackService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSenderService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedDefaultGuidancePosts();
  }

  async seedDefaultGuidancePosts(): Promise<void> {
    try {
      const admin = await this.prisma.user.findFirst({
        where: { role: UserRole.ADMIN },
        select: { id: true },
      });
      if (!admin) return;

      for (const item of JOURNEY_GUIDANCE_CATALOG) {
        const existing = await this.prisma.feedbackPost.findFirst({
          where: { unlockTriggerCode: item.code },
          select: { id: true },
        });
        if (!existing) {
          await this.prisma.feedbackPost.create({
            data: {
              authorId: admin.id,
              title: item.titleAr,
              content: item.contentAr ?? `<p>${item.summaryAr}</p>`,
              visibility: FeedbackVisibility.ALL,
              context: FeedbackContext.GENERAL,
              tags: [FeedbackTag.GENERAL, FeedbackTag.LEARNING],
              unlockTriggerCode: item.code,
              promptTemplate: item.promptTemplateAr,
              tierLevel: item.isAdvanced ? 'ADVANCED' : 'BASIC',
            },
          });
          this.logger.log(`Seeded journey guidance post for ${item.code}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not seed journey guidance posts: ${error}`);
    }
  }

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
      resources: dto.resources || (dto.resource ? [dto.resource] : []),
      unlockTriggerCode: dto.unlockTriggerCode?.trim() || null,
      promptTemplate: dto.promptTemplate?.trim() || null,
    };
  }

  private async createResources(
    tx: Prisma.TransactionClient,
    feedbackId: string,
    resources?: CreateFeedbackDto['resource'][] | null,
  ) {
    if (!resources || !resources.length) return;
    for (const resource of resources) {
      if (!resource?.title || !resource?.url) continue;
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
      unlockTriggerCode: post.unlockTriggerCode ?? null,
      promptTemplate: post.promptTemplate ?? null,
      tierLevel: post.tierLevel ?? 'BASIC',
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
          unlockTriggerCode: data.unlockTriggerCode,
          promptTemplate: data.promptTemplate,
        },
      });
      await this.createResources(tx, created.id, data.resources);
      return tx.feedbackPost.findUniqueOrThrow({
        where: { id: created.id },
        include: feedbackInclude,
      });
    });

    if (dto.sendEmailNotification) {
      if (data.targetUserId) {
        try {
          const target = await this.prisma.user.findUnique({
            where: { id: data.targetUserId },
            select: { id: true, name: true, email: true },
          });
          if (target && target.email) {
            const appUrl = process.env.APP_URL || 'http://localhost:5173';
            const ctaLink = `${appUrl}/guidance`;
            const subject = `ملاحظة وتوجيه جديد من المرشد: ${data.title}`;
            const html = `
              <div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #0f172a; margin-top: 0;">مرحباً ${target.name}،</h2>
                <p style="color: #475569; font-size: 15px; line-height: 1.6;">قام المرشد بإضافة ملاحظة توجيهية جديدة خاصة بك بخصوص رحلتك في البرنامج:</p>
                <div style="background: #f8fafc; border-right: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 6px;">
                  <h4 style="margin: 0 0 8px 0; color: #0f172a;">${data.title}</h4>
                  <p style="margin: 0; color: #334155; white-space: pre-wrap; font-size: 14px;">${data.content}</p>
                </div>
                <div style="text-align: center; margin-top: 24px;">
                  <a href="${ctaLink}" style="display: inline-block; background: #0284c7; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">عرض في قسم التوجيه</a>
                </div>
              </div>
            `;
            await this.emailSender.sendGeneralMail({
              to: target.email,
              recipientName: target.name,
              subject,
              text: `${subject}\n\n${data.content}\n\n${ctaLink}`,
              html,
              type: EmailType.MENTOR_DIRECT,
              userId: target.id,
              channel: 'EMAIL',
            });
          }
        } catch (err) {
          this.logger.warn(
            `Failed to send guidance email to target ${data.targetUserId}: ${err.message}`,
          );
        }
      }
    }

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
      resources: dto.resources === undefined ? existing.resources : dto.resources,
      unlockTriggerCode:
        dto.unlockTriggerCode === undefined
          ? existing.unlockTriggerCode
          : dto.unlockTriggerCode,
      promptTemplate:
        dto.promptTemplate === undefined
          ? existing.promptTemplate
          : dto.promptTemplate,
    };
    const data = await this.buildData(existing.authorId, complete);
    const post = await this.prisma.$transaction(async (tx) => {
      if (dto.resources !== undefined || dto.resource !== undefined) {
        await tx.feedbackResource.deleteMany({ where: { feedbackId: id } });
        await this.createResources(tx, id, data.resources);
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
          unlockTriggerCode: data.unlockTriggerCode,
          promptTemplate: data.promptTemplate,
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

  private async unlockedWhere(userId: string): Promise<Prisma.FeedbackPostWhereInput> {
    const state = await this.prisma.userJourneyState.findUnique({ where: { userId } });
    return { OR: [{ unlockTriggerCode: null }, { unlockTriggerCode: { in: state?.unlockedInsightCodes ?? [] } }] };
  }

  async listForMember(userId: string, query: FeedbackQueryDto) {
    const scope = query.scope ?? 'shared';
    const limit = Math.min(50, Math.max(1, Math.floor(query.limit) || 20));
    const page = Math.max(1, Math.floor(query.page) || 1);
    const where: Prisma.FeedbackPostWhereInput = {
      ...(await this.authorizedWhere(userId, scope)),
      AND: [await this.unlockedWhere(userId)],
      archivedAt: null,
      ...(query.kind === 'guidance'
        ? { unlockTriggerCode: { not: null } }
        : query.kind === 'member'
          ? { unlockTriggerCode: null }
          : {}),
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
        AND: [await this.unlockedWhere(userId)],
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
    const post = await this.findAuthorized(userId, id);
    if (post.unlockTriggerCode === CV_FOUNDATION_CODE) {
      const [state, latest] = await Promise.all([this.prisma.userJourneyState.findUnique({where:{userId}}),this.prisma.userCvHistory.findFirst({where:{userId},orderBy:{versionNumber:'desc'},select:{versionNumber:true,uploadedAt:true}})]);
      if (!state || !cvFoundationStatus(state, latest ? [latest] : []).canComplete) throw new BadRequestException('Upload your revised CV before confirming this guidance');
    }
    const read = await this.prisma.feedbackRead.upsert({
      where: { feedbackId_userId: { feedbackId: id, userId } },
      create: { feedbackId: id, userId },
      update: { readAt: new Date() },
      select: { feedbackId: true, userId: true, readAt: true },
    });

    await this.eventEmitter?.emitAsync('feedback.read', {
      userId,
      feedbackId: id,
      unlockTriggerCode: post.unlockTriggerCode,
    });

    return { success: true, ...read };
  }

  async unreadCount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role !== UserRole.ADMIN) {
      const journey = await this.prisma.userJourneyState.findUnique({
        where: { userId },
        select: { currentWeek: true },
      });
      if ((journey?.currentWeek ?? 0) < 3) {
        return { unreadCount: 0, forYou: 0, shared: 0 };
      }
    }

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
      unlockTriggerCode: null,
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
    const journey = await this.prisma.userJourneyState.findUnique({
      where: { userId },
      select: { currentWeek: true },
    });
    if ((journey?.currentWeek ?? 0) < 3) {
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
    const where: Prisma.FeedbackPostWhereInput = {
      ...(query.archived === 'true'
        ? { archivedAt: { not: null } }
        : { archivedAt: null }),
      ...(query.kind === 'guidance'
        ? { unlockTriggerCode: { not: null } }
        : query.kind === 'member'
          ? { unlockTriggerCode: null }
          : {}),
    };
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
