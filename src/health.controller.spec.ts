import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports readiness after checking PostgreSQL', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns a safe unavailable response if PostgreSQL is down', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockRejectedValue(new Error('private connection details')),
    };
    const controller = new HealthController(prisma as unknown as PrismaService);
    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.check()).rejects.toThrow('Service is not ready');
  });
});
