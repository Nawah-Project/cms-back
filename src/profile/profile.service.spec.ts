/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { CV_MAX_FILE_SIZE_BYTES } from './profile.constants';
import { ProfileService } from './profile.service';

const CURRENT_USER = 'current-user';
const OTHER_USER = 'other-user';
const NEW_KEY = '123e4567-e89b-42d3-a456-426614174000.pdf';
const OLD_KEY = '123e4567-e89b-42d3-a456-426614174001.pdf';

function cvRecord(storageKey = NEW_KEY) {
  return {
    id: 'cv-id',
    originalName: 'Hussein CV.pdf',
    mimeType: 'application/pdf',
    size: validUpload().buffer.length,
    storageKey,
    uploadedAt: new Date('2026-09-26T12:00:00.000Z'),
  };
}

function validUpload(originalname = 'Hussein CV.pdf') {
  const buffer = Buffer.from('%PDF-1.7\nresume');
  return {
    originalname,
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
  };
}

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: any;
  let transaction: any;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'cms-profile-cv-'));
    transaction = {
      userCv: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(cvRecord()),
      },
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: CURRENT_USER }),
      },
      userCv: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((operation: (tx: unknown) => unknown) =>
        operation(transaction),
      ),
    };
    service = new ProfileService(prisma as PrismaService, storageDir);
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  it('returns safe profile data, portfolio, CV metadata, and completion flags', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: CURRENT_USER,
      name: 'Hussein',
      portfolioUrl: 'https://portfolio.example',
      cv: cvRecord(),
    });

    const result = await service.getProfile(CURRENT_USER);

    expect(result).toMatchObject({
      id: CURRENT_USER,
      name: 'Hussein',
      portfolioUrl: 'https://portfolio.example',
      hasCv: true,
      profileComplete: true,
      cv: { originalName: 'Hussein CV.pdf', mimeType: 'application/pdf' },
    });
    expect(result.cv).not.toHaveProperty('storageKey');
  });

  it('updates and removes a portfolio URL without requiring duplicate users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: CURRENT_USER,
      name: 'Hussein',
      portfolioUrl: null,
      cv: null,
    });

    const result = await service.updateProfile(CURRENT_USER, null);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: CURRENT_USER },
      data: { portfolioUrl: null },
      select: { id: true },
    });
    expect(result).toMatchObject({
      portfolioUrl: null,
      hasCv: false,
      profileComplete: false,
    });
  });

  it('stores a valid CV and returns only safe metadata', async () => {
    const result = await service.uploadCv(
      CURRENT_USER,
      validUpload('../Hussein CV.pdf'),
    );

    expect(result).toEqual({
      id: 'cv-id',
      originalName: 'Hussein CV.pdf',
      mimeType: 'application/pdf',
      size: validUpload().buffer.length,
      uploadedAt: '2026-09-26T12:00:00.000Z',
    });
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('filePath');
    expect(transaction.userCv.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: CURRENT_USER },
        create: expect.objectContaining({
          originalName: 'Hussein CV.pdf',
          mimeType: 'application/pdf',
        }),
      }),
    );
  });

  it('rejects a CV larger than the centralized size limit', async () => {
    const file = { ...validUpload(), size: CV_MAX_FILE_SIZE_BYTES + 1 };
    await expect(service.uploadCv(CURRENT_USER, file)).rejects.toThrow(
      PayloadTooLargeException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces the old file only after the new file and metadata are stored', async () => {
    transaction.userCv.findUnique.mockResolvedValue({ storageKey: OLD_KEY });
    transaction.userCv.upsert.mockResolvedValue(cvRecord(NEW_KEY));
    await writeFile(join(storageDir, OLD_KEY), '%PDF-old');

    await service.uploadCv(CURRENT_USER, validUpload());
    const newStorageKey =
      transaction.userCv.upsert.mock.calls[0][0].create.storageKey;

    expect(await readFile(join(storageDir, newStorageKey), 'utf8')).toContain(
      '%PDF-',
    );
    await expect(readFile(join(storageDir, OLD_KEY))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('removes the newly written file if metadata persistence fails', async () => {
    transaction.userCv.upsert.mockRejectedValue(new Error('database failed'));
    await expect(service.uploadCv(CURRENT_USER, validUpload())).rejects.toThrow(
      'database failed',
    );
    expect(await readdir(storageDir)).toEqual([]);
  });

  it('cleans up stale unreferenced CV files while preserving active CVs', async () => {
    const activeKey = NEW_KEY;
    const orphanKey = OLD_KEY;
    await writeFile(join(storageDir, activeKey), '%PDF-active');
    await writeFile(join(storageDir, orphanKey), '%PDF-orphan');
    const oldTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(join(storageDir, orphanKey), oldTime, oldTime);
    prisma.userCv.findMany.mockResolvedValue([{ storageKey: activeKey }]);

    await service.cleanupOrphanedFiles();

    expect(await readFile(join(storageDir, activeKey), 'utf8')).toBe(
      '%PDF-active',
    );
    await expect(readFile(join(storageDir, orphanKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('allows the owner to retrieve their own CV without a group assignment', async () => {
    await writeFile(join(storageDir, NEW_KEY), '%PDF-owner');
    prisma.user.findUnique.mockResolvedValue({
      id: CURRENT_USER,
      membership: null,
      cv: cvRecord(),
    });

    const result = await service.getCvForUser(CURRENT_USER, CURRENT_USER);

    expect(await readFile(result.filePath, 'utf8')).toBe('%PDF-owner');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('allows an active member of the same group to retrieve the CV', async () => {
    await writeFile(join(storageDir, NEW_KEY), '%PDF-group');
    prisma.user.findUnique.mockImplementation(({ where: { id } }: any) =>
      Promise.resolve(
        id === OTHER_USER
          ? { id, membership: { groupId: 'group-a' }, cv: cvRecord() }
          : { role: 'USER', membership: { groupId: 'group-a' } },
      ),
    );

    const result = await service.getCvForUser(CURRENT_USER, OTHER_USER);

    expect(result.metadata.originalName).toBe('Hussein CV.pdf');
  });

  it('denies a member of a different group and an unassigned requester', async () => {
    prisma.user.findUnique.mockImplementation(({ where: { id } }: any) =>
      Promise.resolve(
        id === OTHER_USER
          ? { id, membership: { groupId: 'group-b' }, cv: cvRecord() }
          : { role: 'USER', membership: { groupId: 'group-a' } },
      ),
    );
    await expect(
      service.getCvForUser(CURRENT_USER, OTHER_USER),
    ).rejects.toThrow(ForbiddenException);

    prisma.user.findUnique.mockImplementation(({ where: { id } }: any) =>
      Promise.resolve(
        id === OTHER_USER
          ? { id, membership: { groupId: 'group-a' }, cv: cvRecord() }
          : { role: 'USER', membership: null },
      ),
    );
    await expect(
      service.getCvForUser(CURRENT_USER, OTHER_USER),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies group access when the target has been removed from that group', async () => {
    prisma.user.findUnique.mockImplementation(({ where: { id } }: any) =>
      Promise.resolve(
        id === OTHER_USER
          ? { id, membership: null, cv: cvRecord() }
          : { role: 'USER', membership: { groupId: 'group-a' } },
      ),
    );

    await expect(
      service.getCvForUser(CURRENT_USER, OTHER_USER),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows an admin to retrieve a CV even when the target is unassigned', async () => {
    await writeFile(join(storageDir, NEW_KEY), '%PDF-admin');
    prisma.user.findUnique.mockImplementation(({ where: { id } }: any) =>
      Promise.resolve(
        id === OTHER_USER
          ? { id, membership: null, cv: cvRecord() }
          : { role: 'ADMIN', membership: null },
      ),
    );

    const result = await service.getCvForUser(CURRENT_USER, OTHER_USER);

    expect(result.metadata.mimeType).toBe('application/pdf');
  });
});
