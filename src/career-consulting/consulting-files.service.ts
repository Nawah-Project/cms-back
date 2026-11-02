import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CV_MAX_FILE_SIZE_BYTES,
  CV_STORAGE_DIR,
} from '../profile/profile.constants';
import {
  sanitizeCvOriginalName,
  UploadedCvFile,
  validateCvFileContent,
} from '../profile/cv-file.util';
import { CONSULTING_KEY } from './consulting.validation';
@Injectable()
export class ConsultingFilesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ConsultingFilesService.name);
  readonly root = join(CV_STORAGE_DIR, 'career-consulting');
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    void this.processPending();
    this.timer = setInterval(() => void this.maintain(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  path(key: string) {
    if (!CONSULTING_KEY.test(key))
      throw new BadRequestException('Invalid private document reference');
    return join(CV_STORAGE_DIR, key);
  }
  prepare(file: UploadedCvFile | undefined) {
    if (!file) throw new BadRequestException('Choose a PDF document');
    if (
      file.size > CV_MAX_FILE_SIZE_BYTES ||
      file.buffer.length > CV_MAX_FILE_SIZE_BYTES
    )
      throw new PayloadTooLargeException(
        'The PDF exceeds the configured size limit',
      );
    try {
      validateCvFileContent(file);
    } catch {
      throw new BadRequestException('Choose a valid PDF document');
    }
    return {
      originalName: sanitizeCvOriginalName(file.originalname),
      size: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }
  async write(file: UploadedCvFile) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = `career-consulting/${randomUUID()}.pdf`;
    await writeFile(this.path(key), file.buffer, { flag: 'wx', mode: 0o600 });
    return key;
  }
  async removeUncommitted(key: string) {
    try {
      await unlink(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async processPending() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.careerConsultingFileDeletion.findMany({
        orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
        take: 100,
      });
      for (const job of jobs) {
        if (!CONSULTING_KEY.test(job.storageKey)) {
          this.logger.warn('Invalid consultation cleanup key rejected');
          continue;
        }
        try {
          if (
            !(await this.prisma.careerConsultingFile.count({
              where: { storageKey: job.storageKey },
            }))
          )
            await this.removeUncommitted(job.storageKey);
          await this.prisma.careerConsultingFileDeletion.deleteMany({
            where: { id: job.id },
          });
        } catch {
          await this.prisma.careerConsultingFileDeletion.updateMany({
            where: { id: job.id },
            data: {
              attempts: { increment: 1 },
              lastError: 'FILE_DELETE_RETRY',
            },
          });
        }
      }
    } catch {
      this.logger.warn('Consultation file cleanup will retry');
    } finally {
      this.running = false;
    }
  }
  private lastOrphanScan = 0;
  async maintain() {
    await this.processPending();
    if (Date.now() - this.lastOrphanScan < 30 * 60000) return;
    this.lastOrphanScan = Date.now();
    try {
      const files = await readdir(this.root, { withFileTypes: true }),
        refs = new Set(
          (
            await this.prisma.careerConsultingFile.findMany({
              select: { storageKey: true },
            })
          ).map((x) => x.storageKey),
        );
      for (const f of files) {
        const key = `career-consulting/${f.name}`;
        if (!f.isFile() || !CONSULTING_KEY.test(key) || refs.has(key)) continue;
        const s = await stat(this.path(key));
        if (s.mtimeMs < Date.now() - 86400000)
          await this.removeUncommitted(key);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('Consultation orphan scan will retry');
    }
  }
  async read(key: string) {
    return readFile(this.path(key));
  }
}
