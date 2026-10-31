import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { ASSIGNMENT_LOCK, RESEARCH_QA_ID } from '../members/organized-entry';
import { CV_STORAGE_DIR } from '../profile/profile.constants';
import { OPS_DEFAULTS, OpsSettings } from './operations.model';
import { OperationsSettingsDto } from './operations.dto';
export const CV_BUDGET_LOCK = 684_206_731_105;
export class RegistrationClosedException extends ForbiddenException {
  constructor() {
    super(
      'التسجيل الجديد متوقف مؤقتًا أو اكتملت الدفعة الحالية. دخول الأعضاء الحاليين متاح.',
    );
  }
}
@Injectable()
export class OperationsPolicyService {
  constructor(private readonly prisma: PrismaService) {}
  async settings(db: Prisma.TransactionClient = this.prisma) {
    const row = await db.operationsSettings.findUnique({
      where: { id: 'main' },
    });
    return {
      revision: row?.revision ?? 0,
      ...OPS_DEFAULTS,
      ...((row?.value as Partial<OpsSettings>) ?? {}),
      updatedAt: row?.updatedAt ?? null,
    };
  }
  async registrationStatus() {
    try {
      await this.assertRegistration();
      return { open: true };
    } catch (error) {
      if (error instanceof RegistrationClosedException) return { open: false };
      throw error;
    }
  }
  async assertRegistration(db: Prisma.TransactionClient = this.prisma) {
    const s = await this.settings(db);
    if (s.admissionMode === 'PAUSED') throw new RegistrationClosedException();
    if (
      s.admissionMode === 'LIMITED' &&
      (await db.user.count({
        where: { role: 'USER', id: { not: RESEARCH_QA_ID } },
      })) >= s.maxMembers
    )
      throw new RegistrationClosedException();
  }
  async storage() {
    await mkdir(CV_STORAGE_DIR, { recursive: true, mode: 0o700 });
    const files = await readdir(CV_STORAGE_DIR, { withFileTypes: true });
    let bytes = 0,
      count = 0;
    for (const file of files)
      if (file.isFile() && /^[a-f\d-]{36}\.pdf$/i.test(file.name)) {
        try {
          const info = await stat(join(CV_STORAGE_DIR, file.name));
          bytes += info.size;
          count++;
        } catch {}
      }
    const disk = await statfs(CV_STORAGE_DIR);
    return {
      bytes,
      files: count,
      diskAvailableBytes: disk.bavail * disk.bsize,
      diskTotalBytes: disk.blocks * disk.bsize,
    };
  }
  async withCvBudget<T>(
    userId: string,
    buffer: Buffer,
    operation: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(CV_BUDGET_LOCK)}) IS NULL AS locked`;
        const s = await this.settings(db),
          usage = await this.storage();
        const current = await db.userCv.findUnique({
          where: { userId },
          select: { contentHash: true },
        });
        const duplicate =
          current?.contentHash ===
          createHash('sha256').update(buffer).digest('hex');
        if (!duplicate && usage.bytes + buffer.length > s.cvQuotaMiB * 1048576)
          throw new ForbiddenException(
            'مساحة السير الذاتية المخصصة ممتلئة. يرجى التواصل مع الإدارة.',
          );
        if (
          usage.diskAvailableBytes - buffer.length <
          s.diskReserveMiB * 1048576
        )
          throw new ForbiddenException(
            'مساحة القرص المتاحة أقل من حد الأمان. يرجى التواصل مع الإدارة.',
          );
        return operation(db);
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }
  async update(actorId: string, dto: OperationsSettingsDto) {
    for (const [warn, critical] of [
      ['activeWarn', 'activeCritical'],
      ['latencyWarnMs', 'latencyCriticalMs'],
      ['errorWarnPercent', 'errorCriticalPercent'],
      ['cpuWarn', 'cpuCritical'],
      ['memoryWarn', 'memoryCritical'],
    ] as const)
      if (dto[warn] >= dto[critical])
        throw new BadRequestException(
          'يجب أن يكون حد التحذير أقل من حد الخطر.',
        );
    return this.prisma.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(ASSIGNMENT_LOCK)}) IS NULL AS locked`;
        await db.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(CV_BUDGET_LOCK)}) IS NULL AS locked`;
        const previous = await this.settings(db);
        if (dto.revision !== previous.revision)
          throw new ConflictException(
            'الإعدادات تغيرت. حدّث الصفحة قبل الحفظ.',
          );
        const usage = await this.storage();
        if (dto.cvQuotaMiB * 1048576 < usage.bytes)
          throw new BadRequestException(
            'لا يمكن خفض الحصة عن مساحة الملفات الموجودة؛ لن تُحذف ملفات تلقائيًا.',
          );
        const { revision, ...value } = dto;
        await db.operationsSettings.upsert({
          where: { id: 'main' },
          create: { id: 'main', revision: 1, value, updatedBy: actorId },
          update: { revision: { increment: 1 }, value, updatedBy: actorId },
        });
        await db.operationsSettingsAudit.create({
          data: {
            actorId,
            revision: revision + 1,
            previous: previous as unknown as Prisma.InputJsonValue,
            next: value,
          },
        });
        return this.settings(db);
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }
}
