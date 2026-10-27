import {
  ForbiddenException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  CV_MAX_FILE_SIZE_BYTES,
  CV_ORPHAN_FILE_GRACE_PERIOD_MS,
} from './profile.constants';
import {
  sanitizeCvOriginalName,
  validateCvFileContent,
  type UploadedCvFile,
} from './cv-file.util';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { toSafeCvMetadata } from './profile.types';

const CV_MIME_TYPE = 'application/pdf';
const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

@Injectable()
export class ProfileService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ProfileService.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageDir: string,
    private readonly groupAssignment?: GroupAssignmentService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.cleanupOrphanedFiles();
    this.cleanupTimer = setInterval(
      () => void this.cleanupOrphanedFiles(),
      CV_ORPHAN_FILE_GRACE_PERIOD_MS,
    );
    this.cleanupTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async cleanupOrphanedFiles(): Promise<{
    deletedCount: number;
    freedBytes: number;
  }> {
    let files: Dirent[];
    try {
      files = await readdir(this.storageDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          'Unable to scan private CV storage for orphaned files',
        );
      }
      return { deletedCount: 0, freedBytes: 0 };
    }

    let deletedCount = 0;
    let freedBytes = 0;

    try {
      const activeUserCvs = await this.prisma.userCv.findMany({
        select: { storageKey: true },
      });
      const activeCvHistories = await this.prisma.userCvHistory.findMany({
        select: { storageKey: true },
      });
      const activeFiles = new Set([
        ...activeUserCvs.map(({ storageKey }) => storageKey),
        ...activeCvHistories.map(({ storageKey }) => storageKey),
      ]);
      const staleBefore = Date.now() - CV_ORPHAN_FILE_GRACE_PERIOD_MS;
      await Promise.all(
        files
          .filter(
            (file) =>
              file.isFile() &&
              STORAGE_KEY_PATTERN.test(file.name) &&
              !activeFiles.has(file.name),
          )
          .map(async (file) => {
            try {
              const filePath = join(this.storageDir, file.name);
              const fileInfo = await stat(filePath);
              if (fileInfo.mtimeMs < staleBefore) {
                await unlink(filePath);
                deletedCount += 1;
                freedBytes += fileInfo.size;
              }
            } catch {
              // Ignore single file unlink error
            }
          }),
      );
    } catch {
      this.logger.warn('Unable to finish scanning private CV storage');
    }

    return { deletedCount, freedBytes };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        portfolioUrl: true,
        targetJobTitle: true,
        cv: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            uploadedAt: true,
          },
        },
        journeyState: {
          select: {
            cvVersionNumber: true,
          },
        },
        cvHistory: {
          select: {
            id: true,
            versionNumber: true,
            originalName: true,
            mimeType: true,
            size: true,
            uploadedAt: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('Profile not found');
    const cv = toSafeCvMetadata(user.cv);
    return {
      id: user.id,
      name: user.name,
      portfolioUrl: user.portfolioUrl,
      targetJobTitle: user.targetJobTitle ?? null,
      cv,
      hasCv: cv !== null,
      cvVersionNumber: user.journeyState?.cvVersionNumber ?? 1,
      cvHistory: user.cvHistory ?? [],
      profileComplete: Boolean(
        user.portfolioUrl && cv && user.targetJobTitle?.trim(),
      ),
    };
  }

  async updateProfile(
    userId: string,
    portfolioUrl?: string | null,
    name?: string,
    targetJobTitle?: string | null,
    preferredLocations?: string[],
  ) {
    if (
      portfolioUrl !== undefined ||
      name !== undefined ||
      targetJobTitle !== undefined ||
      preferredLocations !== undefined
    ) {
      const data: Prisma.UserUpdateInput = {};
      if (portfolioUrl !== undefined) {
        data.portfolioUrl = portfolioUrl?.trim() || null;
      }
      if (name !== undefined) data.name = name.trim();
      if (targetJobTitle !== undefined) {
        data.targetJobTitle = targetJobTitle?.trim() || null;
      }
      if (preferredLocations !== undefined) {
        data.preferredLocations = preferredLocations;
      }
      const save = async (db: Prisma.TransactionClient) => {
        if (targetJobTitle !== undefined && this.groupAssignment) {
          const membership = await db.membership.findUnique({
            where: { userId },
            select: { groupId: true },
          });
          if (membership)
            await this.groupAssignment.assertCompatible(
              db,
              userId,
              membership.groupId,
              targetJobTitle,
            );
        }
        await db.user.update({
          where: { id: userId },
          data,
          select: { id: true },
        });
      };
      if (this.groupAssignment)
        await this.groupAssignment.withAssignmentLock(save);
      else await save(this.prisma);
    }
    return this.getProfile(userId);
  }

  async uploadCv(userId: string, file: UploadedCvFile | undefined) {
    if (!file) throw new BadRequestException('A CV file is required');
    if (file.size > CV_MAX_FILE_SIZE_BYTES)
      throw new PayloadTooLargeException(
        'The CV exceeds the configured size limit',
      );
    validateCvFileContent(file);
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const legacy = await this.prisma.userCv.findUnique({ where: { userId } });
    let legacyMatches = false;
    if (
      legacy &&
      !legacy.contentHash &&
      STORAGE_KEY_PATTERN.test(legacy.storageKey)
    ) {
      try {
        legacyMatches =
          createHash('sha256')
            .update(await readFile(join(this.storageDir, legacy.storageKey)))
            .digest('hex') === contentHash;
      } catch {
        /* A missing legacy file requires a real replacement. */
      }
    }
    const storageKey = `${randomUUID()}.pdf`;
    await mkdir(this.storageDir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.storageDir, storageKey), file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await this.prisma.$transaction(
            async (tx) => {
              const previous = await tx.userCv.findUnique({
                where: { userId },
              });
              if (
                previous &&
                (previous.contentHash === contentHash ||
                  (legacyMatches && previous.storageKey === legacy?.storageKey))
              ) {
                return { cv: previous, reused: true };
              }
              const [state, latest] = await Promise.all([
                tx.userJourneyState.findUnique({ where: { userId } }),
                tx.userCvHistory.findFirst({
                  where: { userId },
                  orderBy: { versionNumber: 'desc' },
                }),
              ]);
              const versionNumber =
                previous || latest
                  ? Math.max(
                      state?.cvVersionNumber ?? 0,
                      latest?.versionNumber ?? 0,
                    ) + 1
                  : 1;
              const data = {
                originalName: sanitizeCvOriginalName(file.originalname),
                mimeType: CV_MIME_TYPE,
                size: file.buffer.length,
                storageKey,
              };
              await tx.userCvHistory.create({
                data: { userId, versionNumber, ...data },
              });
              if (state)
                await tx.userJourneyState.update({
                  where: { userId },
                  data: { cvVersionNumber: versionNumber },
                });
              const cv = await tx.userCv.upsert({
                where: { userId },
                create: { userId, ...data, contentHash },
                update: { ...data, contentHash, uploadedAt: new Date() },
              });
              return { cv, reused: false };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          if (result.reused) await this.deleteStoredCv(storageKey);
          return toSafeCvMetadata(result.cv);
        } catch (error) {
          if ((error as { code?: string }).code !== 'P2034' || attempt >= 4)
            throw error;
        }
      }
    } catch (error) {
      await this.deleteStoredCv(storageKey);
      throw error;
    }
  }

  async getCvHistoryFile(requesterId: string, historyId: string) {
    const historyItem = await this.prisma.userCvHistory.findUnique({
      where: { id: historyId },
    });
    if (!historyItem) throw new NotFoundException('CV history item not found');
    if (historyItem.userId !== requesterId) {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { role: true },
      });
      if (requester?.role !== UserRole.ADMIN) {
        throw new ForbiddenException('You cannot access this CV');
      }
    }
    if (!STORAGE_KEY_PATTERN.test(historyItem.storageKey)) {
      this.logger.error(`Invalid stored CV history key: ${historyId}`);
      throw new NotFoundException('CV file is unavailable');
    }
    const filePath = join(this.storageDir, historyItem.storageKey);
    try {
      await access(filePath, fsConstants.R_OK);
    } catch {
      throw new NotFoundException('CV file is unavailable');
    }
    return {
      filePath,
      metadata: {
        id: historyItem.id,
        versionNumber: historyItem.versionNumber,
        originalName: historyItem.originalName,
        mimeType: historyItem.mimeType,
        size: historyItem.size,
        uploadedAt: historyItem.uploadedAt,
      },
    };
  }

  async getCvForUser(requesterId: string, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        membership: { select: { groupId: true } },
        cv: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            storageKey: true,
            uploadedAt: true,
          },
        },
      },
    });
    if (!target) throw new NotFoundException('CV not found');

    if (requesterId !== targetUserId) {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
        select: {
          role: true,
          membership: { select: { groupId: true } },
        },
      });
      if (!requester) throw new UnauthorizedException();
      const isAdmin = requester.role === UserRole.ADMIN;
      const sharesActiveGroup = Boolean(
        requester.membership &&
        target.membership &&
        requester.membership.groupId === target.membership.groupId,
      );
      if (!isAdmin && !sharesActiveGroup) {
        throw new ForbiddenException('You cannot access this CV');
      }
    }

    if (!target.cv) throw new NotFoundException('CV not found');
    if (!STORAGE_KEY_PATTERN.test(target.cv.storageKey)) {
      this.logger.error(`Invalid stored CV key for user ${targetUserId}`);
      throw new NotFoundException('CV file is unavailable');
    }

    const filePath = join(this.storageDir, target.cv.storageKey);
    try {
      await access(filePath, fsConstants.R_OK);
    } catch {
      throw new NotFoundException('CV file is unavailable');
    }

    const metadata = toSafeCvMetadata(target.cv);
    if (!metadata) throw new NotFoundException('CV not found');
    return { filePath, metadata };
  }

  private async deleteStoredCv(storageKey: string): Promise<void> {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return;
    try {
      await unlink(join(this.storageDir, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Unable to remove replaced CV file ${storageKey}`);
      }
    }
  }
}
