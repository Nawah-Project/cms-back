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
import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  access,
  mkdir,
  readdir,
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

  async cleanupOrphanedFiles(): Promise<void> {
    let files: Dirent[];
    try {
      files = await readdir(this.storageDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          'Unable to scan private CV storage for orphaned files',
        );
      }
      return;
    }

    try {
      const activeFiles = new Set(
        (
          await this.prisma.userCv.findMany({
            select: { storageKey: true },
          })
        ).map(({ storageKey }) => storageKey),
      );
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
            const filePath = join(this.storageDir, file.name);
            const fileInfo = await stat(filePath);
            if (fileInfo.mtimeMs < staleBefore) await unlink(filePath);
          }),
      );
    } catch {
      this.logger.warn('Unable to finish scanning private CV storage');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        portfolioUrl: true,
        cv: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            uploadedAt: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Profile not found');
    const cv = toSafeCvMetadata(user.cv);
    return {
      id: user.id,
      name: user.name,
      portfolioUrl: user.portfolioUrl,
      cv,
      hasCv: cv !== null,
      profileComplete: Boolean(user.portfolioUrl && cv),
    };
  }

  async updateProfile(userId: string, portfolioUrl?: string | null) {
    if (portfolioUrl !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { portfolioUrl: portfolioUrl?.trim() || null },
        select: { id: true },
      });
    }
    return this.getProfile(userId);
  }

  async uploadCv(userId: string, file: UploadedCvFile | undefined) {
    if (!file) throw new BadRequestException('A CV file is required');
    if (file.size > CV_MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        'The CV exceeds the configured size limit',
      );
    }
    validateCvFileContent(file);

    const storageKey = `${randomUUID()}.pdf`;
    const newFilePath = join(this.storageDir, storageKey);
    const originalName = sanitizeCvOriginalName(file.originalname);
    await mkdir(this.storageDir, { recursive: true, mode: 0o700 });
    await writeFile(newFilePath, file.buffer, { flag: 'wx', mode: 0o600 });

    try {
      const result = await this.prisma.$transaction(
        async (transaction) => {
          const previous = await transaction.userCv.findUnique({
            where: { userId },
            select: { storageKey: true },
          });
          const cv = await transaction.userCv.upsert({
            where: { userId },
            create: {
              userId,
              originalName,
              mimeType: CV_MIME_TYPE,
              size: file.buffer.length,
              storageKey,
            },
            update: {
              originalName,
              mimeType: CV_MIME_TYPE,
              size: file.buffer.length,
              storageKey,
              uploadedAt: new Date(),
            },
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              size: true,
              uploadedAt: true,
            },
          });
          return { cv, previousStorageKey: previous?.storageKey };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (
        result.previousStorageKey &&
        result.previousStorageKey !== storageKey
      ) {
        await this.deleteStoredCv(result.previousStorageKey);
      }
      return toSafeCvMetadata(result.cv);
    } catch (error) {
      await this.deleteStoredCv(storageKey);
      throw error;
    }
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
