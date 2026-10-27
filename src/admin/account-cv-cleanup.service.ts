import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { CV_STORAGE_DIR } from "../profile/profile.constants";
export const CV_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
@Injectable()
export class AccountCvCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AccountCvCleanupService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageDir = CV_STORAGE_DIR,
  ) {}
  onApplicationBootstrap() {
    void this.processPending();
    this.timer = setInterval(() => void this.processPending(), 30_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async processPending(keys?: string[]) {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.cvDeletionJob.findMany({
        where: keys ? { storageKey: { in: keys } } : {},
        orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
        take: 100,
      });
      for (const job of jobs) {
        if (!CV_KEY.test(job.storageKey)) {
          this.logger.error("Rejected an invalid private CV cleanup key");
          continue;
        }
        try {
          // An old import can share a file: never remove another account's CV.
          const references =
            (await this.prisma.userCv.count({
              where: { storageKey: job.storageKey },
            })) +
            (await this.prisma.userCvHistory.count({
              where: { storageKey: job.storageKey },
            }));
          if (!references) {
            try {
              await unlink(join(this.storageDir, job.storageKey));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                throw error;
            }
          }
          await this.prisma.cvDeletionJob.deleteMany({ where: { id: job.id } });
        } catch {
          await this.prisma.cvDeletionJob.updateMany({
            where: { id: job.id },
            data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
          });
          this.logger.warn(
            "Private CV cleanup deferred; its durable job will retry",
          );
        }
      }
    } catch {
      this.logger.error(
        "Private CV cleanup could not run; pending jobs remain durable",
      );
    } finally {
      this.running = false;
    }
  }
}
