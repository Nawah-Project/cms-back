import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationsPolicyService } from './operations-policy.service';
import { OperationsCollectorService } from './operations-collector.service';
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OperationsPolicyService, OperationsCollectorService],
  exports: [OperationsPolicyService, OperationsCollectorService],
})
export class OperationsModule {}
