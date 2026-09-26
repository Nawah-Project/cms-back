import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      this.logger.error('Unable to connect to the configured PostgreSQL database');
      throw new Error('Database connection failed during startup');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
