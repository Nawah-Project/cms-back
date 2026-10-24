import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmailDeliveryStatus,
  EmailType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailSenderService } from '../../auth/email-sender.service';
import {
  NotificationLogQueryDto,
  PreviewRecipientsDto,
  SendCustomNotificationDto,
  UpdateNotificationConfigDto,
} from './dto/admin-notifications.dto';

export interface TargetMember {
  id: string;
  name: string;
  email: string;
  groupName: string | null;
  currentQuestTitle: string | null;
}

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSenderService,
  ) {}

  async getOrCreateConfig() {
    return this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        dailyEmailLimit: 100,
        monthlyEmailLimit: 3000,
        otpSafeReserve: 15,
        otpSafeReserveEnabled: true,
      },
    });
  }

  async getStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [config, dailyUsed, monthlyUsed, totalUsers, verifiedUsers] =
      await Promise.all([
        this.getOrCreateConfig(),
        this.prisma.emailDeliveryLog.count({
          where: {
            createdAt: { gte: startOfDay },
            status: { not: EmailDeliveryStatus.FAILED },
          },
        }),
        this.prisma.emailDeliveryLog.count({
          where: {
            createdAt: { gte: startOfMonth },
            status: { not: EmailDeliveryStatus.FAILED },
          },
        }),
        this.prisma.user.count({ where: { role: UserRole.USER } }),
        this.prisma.user.count({
          where: { role: UserRole.USER, emailVerified: true },
        }),
      ]);

    const dailyLimit = config.dailyEmailLimit;
    const monthlyLimit = config.monthlyEmailLimit;

    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

    const unverifiedUsers = Math.max(0, totalUsers - verifiedUsers);

    const dailyPercent = Math.min(
      100,
      Math.round((dailyUsed / (dailyLimit || 1)) * 100),
    );
    const monthlyPercent = Math.min(
      100,
      Math.round((monthlyUsed / (monthlyLimit || 1)) * 100),
    );
    const verifiedPercent = Math.min(
      100,
      Math.round((verifiedUsers / (totalUsers || 1)) * 100),
    );
    const smtpStatus = this.emailSender.getSmtpStatus();

    return {
      smtp: {
        ...smtpStatus,
        active: smtpStatus.configured,
      },
      daily: {
        sent: dailyUsed,
        used: dailyUsed,
        limit: dailyLimit,
        remaining: dailyRemaining,
        percentUsed: dailyPercent,
        percentage: dailyPercent,
        otpSafeReserve: config.otpSafeReserve,
        safeAvailableForBulk: Math.max(0, dailyRemaining - config.otpSafeReserve),
      },
      monthly: {
        sent: monthlyUsed,
        used: monthlyUsed,
        limit: monthlyLimit,
        remaining: monthlyRemaining,
        percentUsed: monthlyPercent,
        percentage: monthlyPercent,
      },
      verification: {
        verifiedUsers,
        verifiedCount: verifiedUsers,
        totalUsers,
        unverifiedUsers,
        unverifiedCount: unverifiedUsers,
        verifiedPercent,
        percentage: verifiedPercent,
      },
      config: {
        id: config.id,
        dailyEmailLimit: config.dailyEmailLimit,
        monthlyEmailLimit: config.monthlyEmailLimit,
        otpSafeReserve: config.otpSafeReserve,
        otpSafeReserveEnabled: config.otpSafeReserveEnabled,
        updatedAt: config.updatedAt,
      },
      safeReserveNotice: config.otpSafeReserve,
    };
  }

  async sendTestEmail(adminUserId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { email: true, name: true },
    });
    if (!admin?.email) {
      throw new NotFoundException('حساب المسؤول غير مسجل ببريد إلكتروني صالح');
    }

    const timestamp = new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());

    const subject = `بريد تجريبي لاختبار إعدادات المنصة | Nawah SMTP Health Check`;
    const text = [
      `مرحباً ${admin.name}،`,
      ``,
      `هذه رسالة اختبار اتصال بريدي تجريبية مرسلة من لوحة تحكم منصة نواة (مركز البريد والإشعارات).`,
      `وقت الإرسال: ${timestamp}`,
      `إذا وصلك هذا البريد في صندوق الوارد (Inbox)، فهذا يعني أن خادم SMTP يعمل بكفاءة وموثوقية عالية.`,
    ].join('\r\n');

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
    <div style="text-align:right;direction:rtl;">
      <span style="display:inline-block;background:#dcfce7;color:#15803d;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;">✓ اختبار اتصال SMTP ناجح</span>
      <h2 style="margin:16px 0 8px;font-size:22px;color:#0f172a;">رسالة اختبار من منصة نواة</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#334155;">
        مرحباً <strong>${admin.name}</strong>،<br />
        هذه رسالة تجريبية لتأكيد صحة اتصال خادم البريد وتوفر معايير التسليم في الـ Inbox.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0;font-size:13px;color:#475569;">
        <p style="margin:0 0 6px;"><strong>التوقيت:</strong> ${timestamp}</p>
        <p style="margin:0 0 6px;"><strong>المستلم:</strong> ${admin.email}</p>
        <p style="margin:0;"><strong>الحالة:</strong> جاهز للإرسال والاستخدام الحي</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    await this.emailSender.sendGeneralMail({
      to: admin.email,
      recipientName: admin.name,
      subject,
      text,
      html,
      type: EmailType.TEST_EMAIL,
      userId: adminUserId,
      channel: 'EMAIL',
    });

    return {
      success: true,
      message: 'تم إرسال البريد التجريبي بنجاح إلى بريدك الشخصي',
      recipient: admin.email,
    };
  }

  async resolveRecipients(dto: PreviewRecipientsDto): Promise<TargetMember[]> {
    if (dto.targetType === 'MEMBERS') {
      if (!dto.memberIds?.length) return [];
      const users = await this.prisma.user.findMany({
        where: { id: { in: dto.memberIds }, role: UserRole.USER },
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { group: { select: { name: true } } } },
          journeyState: { select: { currentNodeCode: true } },
        },
      });
      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        groupName: u.membership?.group?.name ?? null,
        currentQuestTitle: u.journeyState?.currentNodeCode ?? null,
      }));
    }

    if (dto.targetType === 'GROUP') {
      if (!dto.groupId) return [];
      const whereCondition =
        dto.groupId === 'ALL'
          ? { role: UserRole.USER }
          : { role: UserRole.USER, membership: { groupId: dto.groupId } };

      const users = await this.prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { group: { select: { name: true } } } },
          journeyState: { select: { currentNodeCode: true } },
        },
      });
      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        groupName: u.membership?.group?.name ?? null,
        currentQuestTitle: u.journeyState?.currentNodeCode ?? null,
      }));
    }

    if (dto.targetType === 'SMART_SEGMENT') {
      if (!dto.smartSegment) return [];

      let where: Prisma.UserWhereInput = { role: UserRole.USER };

      if (dto.smartSegment === 'TASK_0_STALLED') {
        where = {
          role: UserRole.USER,
          OR: [
            { journeyState: { is: { isGroupUnlocked: false } } },
            { journeyState: { is: { currentNodeCode: 'TASK_0' } } },
          ],
        };
      } else if (dto.smartSegment === 'UNASSIGNED_GROUP') {
        where = {
          role: UserRole.USER,
          membership: null,
        };
      } else if (dto.smartSegment === 'OVERDUE_TASKS') {
        where = {
          role: UserRole.USER,
          assignedTasks: {
            some: {
              dueDate: { lt: new Date() },
              status: { not: 'DONE' },
            },
          },
        };
      } else if (dto.smartSegment === 'INACTIVE_7_DAYS') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        where = {
          role: UserRole.USER,
          applications: {
            none: {
              updatedAt: { gte: sevenDaysAgo },
            },
          },
          taskNotes: {
            none: {
              createdAt: { gte: sevenDaysAgo },
            },
          },
        };
      }

      const users = await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { group: { select: { name: true } } } },
          journeyState: { select: { currentNodeCode: true } },
        },
      });

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        groupName: u.membership?.group?.name ?? null,
        currentQuestTitle: u.journeyState?.currentNodeCode ?? null,
      }));
    }

    return [];
  }

  async previewRecipients(dto: PreviewRecipientsDto): Promise<{
    count: number;
    recipients: TargetMember[];
    members: TargetMember[];
  }> {
    const members = await this.resolveRecipients(dto);
    const slice = members.slice(0, 50);
    return {
      count: members.length,
      recipients: slice,
      members: slice,
    };
  }

  async sendCustomNotification(
    adminUserId: string,
    dto: SendCustomNotificationDto,
  ) {
    const recipients = await this.resolveRecipients({
      targetType: dto.targetType,
      memberIds: dto.memberIds,
      groupId: dto.groupId,
      smartSegment: dto.smartSegment,
    });

    if (recipients.length === 0) {
      throw new BadRequestException(
        'لم يتم العثور على أي أعضاء مطابقين للجمهور المحدد',
      );
    }

    const sendsEmail =
      dto.channel === 'EMAIL_AND_BELL' || dto.channel === 'EMAIL_ONLY';
    const sendsBell =
      dto.channel === 'EMAIL_AND_BELL' || dto.channel === 'BELL_ONLY';

    // Verify quota upfront before executing
    if (sendsEmail) {
      await this.emailSender.checkQuotaAndSafeReserve(recipients.length, false);
    }

    let deliveredCount = 0;
    let failedCount = 0;

    for (const member of recipients) {
      const personalizedBody = dto.body
        .replace(/\{اسم_العضو\}/g, member.name)
        .replace(/\{اسم_المجموعة\}/g, member.groupName || 'مجموعتك')
        .replace(/\{المهمة_الحالية\}/g, member.currentQuestTitle || 'المهمة صفر');

      const personalizedSubject = dto.subject
        .replace(/\{اسم_العضو\}/g, member.name)
        .replace(/\{اسم_المجموعة\}/g, member.groupName || 'مجموعتك');

      // 1. Send in-app Bell notification if selected
      if (sendsBell) {
        try {
          await this.prisma.notification.create({
            data: {
              userId: member.id,
              type: 'SYSTEM_ANNOUNCEMENT',
              titleAr: personalizedSubject,
              titleEn: personalizedSubject,
              bodyAr: personalizedBody,
              bodyEn: personalizedBody,
              actionUrl: dto.ctaLink?.trim() || null,
            },
          });
          if (!sendsEmail) {
            await this.prisma.emailDeliveryLog.create({
              data: {
                type: EmailType.SYSTEM_ANNOUNCEMENT,
                recipientEmail: member.email,
                recipientName: member.name,
                userId: member.id,
                subject: personalizedSubject,
                status: EmailDeliveryStatus.DELIVERED,
                channel: 'BELL',
              },
            });
            deliveredCount++;
          }
        } catch (err) {
          this.logger.error(
            `Failed to create notification for ${member.id}`,
            err,
          );
        }
      }

      // 2. Send email if selected
      if (sendsEmail && member.email) {
        const ctaMarkup = dto.ctaLink?.trim()
          ? `<div style="text-align:center;margin:28px 0;">
              <a href="${dto.ctaLink.trim()}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">
                ${dto.ctaText?.trim() || 'الانتقال إلى المنصة الآن'}
              </a>
             </div>`
          : '';

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
    <div style="text-align:right;direction:rtl;">
      <span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;">مشروع نواة — إشعار من الإدارة</span>
      <h2 style="margin:16px 0 12px;font-size:20px;color:#0f172a;line-height:1.4;">${personalizedSubject}</h2>
      <div style="font-size:14px;line-height:1.8;color:#334155;white-space:pre-wrap;margin:16px 0;">${personalizedBody}</div>
      ${ctaMarkup}
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
    <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
      منصة نواة للتوجيه والتطوير المهني. تم إرسال هذه الرسالة لك بصفتك عضواً مسجلاً.
    </p>
  </div>
</body>
</html>`;

        try {
          await this.emailSender.sendGeneralMail({
            to: member.email,
            recipientName: member.name,
            subject: personalizedSubject,
            text: personalizedBody,
            html,
            type: EmailType.SYSTEM_ANNOUNCEMENT,
            userId: member.id,
            channel: dto.channel,
          });
          deliveredCount++;
        } catch (emailErr) {
          failedCount++;
          this.logger.error(
            `Failed sending email to member ${member.email}`,
            emailErr,
          );
        }
      } else if (sendsBell) {
        deliveredCount++;
      }
    }

    const emailSentCount = sendsEmail ? Math.max(0, deliveredCount) : 0;
    const bellSentCount = sendsBell ? recipients.length : 0;

    return {
      success: true,
      totalTargeted: recipients.length,
      totalRecipients: recipients.length,
      deliveredCount,
      failedCount,
      emailSentCount,
      bellSentCount,
      channel: dto.channel,
      message: `تم إرسال الإشعار بنجاح إلى ${deliveredCount} عضواً`,
    };
  }

  async getLogs(query: NotificationLogQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    let where: Prisma.EmailDeliveryLogWhereInput = {};

    if (query.filter === 'FAILED') {
      where = { status: EmailDeliveryStatus.FAILED };
    } else if (query.filter === 'VERIFICATION_OTP') {
      where = { type: EmailType.VERIFICATION_OTP };
    } else if (query.filter === 'MENTOR_DIRECT') {
      where = { type: EmailType.MENTOR_DIRECT };
    } else if (query.filter === 'SYSTEM_ANNOUNCEMENT') {
      where = { type: EmailType.SYSTEM_ANNOUNCEMENT };
    }

    const [items, total] = await Promise.all([
      this.prisma.emailDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              membership: { select: { group: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.emailDeliveryLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async retryLog(logId: string) {
    const log = await this.prisma.emailDeliveryLog.findUnique({
      where: { id: logId },
    });
    if (!log) throw new NotFoundException('السجل غير موجود');

    await this.emailSender.sendGeneralMail({
      to: log.recipientEmail,
      recipientName: log.recipientName || undefined,
      subject: log.subject,
      text: log.bodyText || log.subject,
      html: log.bodyHtml || `<p>${log.subject}</p>`,
      type: log.type,
      userId: log.userId || undefined,
      channel: log.channel,
    });

    await this.prisma.emailDeliveryLog.update({
      where: { id: logId },
      data: {
        status: EmailDeliveryStatus.DELIVERED,
        errorMessage: null,
        sentAt: new Date(),
      },
    });

    return { success: true };
  }

  async updateConfig(dto: UpdateNotificationConfigDto) {
    const updated = await this.prisma.notificationConfig.upsert({
      where: { id: 'default' },
      update: {
        ...(dto.dailyEmailLimit !== undefined
          ? { dailyEmailLimit: dto.dailyEmailLimit }
          : {}),
        ...(dto.monthlyEmailLimit !== undefined
          ? { monthlyEmailLimit: dto.monthlyEmailLimit }
          : {}),
        ...(dto.otpSafeReserve !== undefined
          ? { otpSafeReserve: dto.otpSafeReserve }
          : {}),
        ...(dto.otpSafeReserveEnabled !== undefined
          ? { otpSafeReserveEnabled: dto.otpSafeReserveEnabled }
          : {}),
      },
      create: {
        id: 'default',
        dailyEmailLimit: dto.dailyEmailLimit ?? 100,
        monthlyEmailLimit: dto.monthlyEmailLimit ?? 3000,
        otpSafeReserve: dto.otpSafeReserve ?? 15,
        otpSafeReserveEnabled: dto.otpSafeReserveEnabled ?? true,
      },
    });

    return updated;
  }

  async remindUnverified() {
    const unverifiedUsers = await this.prisma.user.findMany({
      where: { role: UserRole.USER, emailVerified: false },
      select: { id: true, name: true, email: true },
    });

    if (unverifiedUsers.length === 0) {
      return {
        success: true,
        totalTargeted: 0,
        totalUnverified: 0,
        sentCount: 0,
        remindedCount: 0,
        failedCount: 0,
        message: 'جميع حسابات الأعضاء موثقة بالفعل',
      };
    }

    await this.emailSender.checkQuotaAndSafeReserve(
      unverifiedUsers.length,
      false,
    );

    let remindedCount = 0;
    for (const u of unverifiedUsers) {
      try {
        const subject = `تذكير بتأكيد بريدك الإلكتروني في منصة نواة | Verify Your Email`;
        const text = `مرحباً ${u.name}، نود تذكيرك بتأكيد بريدك الإلكتروني للاستفادة الكاملة من مميزات منصة نواة والبدء في رحلتك المهنية.`;
        const html = `<div dir="rtl" style="font-family:sans-serif;padding:24px;">
          <h3>مرحباً ${u.name}،</h3>
          <p>نود تذكيرك بتأكيد بريدك الإلكتروني في منصة نواة لتتمكن من التفاعل والمشاركة الكاملة في مجتمع التعلم ورحلة التقديمات.</p>
        </div>`;

        await this.emailSender.sendGeneralMail({
          to: u.email,
          recipientName: u.name,
          subject,
          text,
          html,
          type: EmailType.VERIFICATION_REMINDER,
          userId: u.id,
          channel: 'EMAIL',
        });
        remindedCount++;
      } catch (err) {
        this.logger.error(`Failed sending reminder to ${u.email}`, err);
      }
    }

    return {
      success: true,
      totalTargeted: unverifiedUsers.length,
      totalUnverified: unverifiedUsers.length,
      sentCount: remindedCount,
      remindedCount,
      failedCount: Math.max(0, unverifiedUsers.length - remindedCount),
      message: `تم إرسال تذكيرات بنجاح إلى ${remindedCount} عضو`,
    };
  }
}
