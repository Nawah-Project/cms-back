import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { databaseQueryDuration } from '../observability/metrics.registry';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    const queryEvents = this as unknown as {
      $on: (event: 'query', handler: (value: { duration: number }) => void) => void;
    };
    queryEvents.$on('query', (event) => databaseQueryDuration.observe(event.duration / 1000));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch {
      this.logger.error(
        'Unable to connect to the configured PostgreSQL database',
      );
      throw new Error('Database connection failed during startup');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
