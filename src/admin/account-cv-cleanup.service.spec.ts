import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AccountCvCleanupService } from "./account-cv-cleanup.service";
const key = "2c000000-0000-4000-8000-000000000001.pdf";
describe("Account CV cleanup", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "account-cv-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  function setup(storageKey = key, references = 0) {
    const prisma = {
      cvDeletionJob: {
        findMany: jest.fn().mockResolvedValue([{ id: "job", storageKey }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userCv: { count: jest.fn().mockResolvedValue(references) },
      userCvHistory: { count: jest.fn().mockResolvedValue(0) },
    };
    return {
      prisma,
      service: new AccountCvCleanupService(prisma as never, dir),
    };
  }
  it("removes a private file and its durable job", async () => {
    const { prisma, service } = setup();
    await writeFile(join(dir, key), "synthetic");
    await service.processPending();
    await expect(readFile(join(dir, key))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(prisma.cvDeletionJob.deleteMany).toHaveBeenCalled();
  });
  it("treats an already missing file as completed cleanup", async () => {
    const { prisma, service } = setup();
    await service.processPending();
    expect(prisma.cvDeletionJob.deleteMany).toHaveBeenCalled();
  });
  it("retains a referenced file belonging to another account", async () => {
    const { prisma, service } = setup(key, 1);
    await writeFile(join(dir, key), "shared");
    await service.processPending();
    expect(await readFile(join(dir, key), "utf8")).toBe("shared");
    expect(prisma.cvDeletionJob.deleteMany).toHaveBeenCalled();
  });
  it("retains a failed job and succeeds after the filesystem recovers", async () => {
    const { prisma, service } = setup();
    await mkdir(join(dir, key));
    await service.processPending();
    expect(prisma.cvDeletionJob.updateMany).toHaveBeenCalled();
    expect(prisma.cvDeletionJob.deleteMany).not.toHaveBeenCalled();
    await rm(join(dir, key), { recursive: true });
    await writeFile(join(dir, key), "recovered");
    await service.processPending();
    expect(prisma.cvDeletionJob.deleteMany).toHaveBeenCalled();
  });
  it("never follows a path outside private CV storage", async () => {
    const { prisma, service } = setup("../outside.pdf");
    await service.processPending();
    expect(prisma.userCv.count).not.toHaveBeenCalled();
    expect(prisma.cvDeletionJob.deleteMany).not.toHaveBeenCalled();
  });
});
