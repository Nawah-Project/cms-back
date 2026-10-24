import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { DomainEventAuditListener } from './domain-event-audit.listener';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    DomainEventAuditListener,
  ],
  exports: [DomainEventAuditListener],
})
export class ObservabilityModule {}
