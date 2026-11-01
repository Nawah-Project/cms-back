import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IndividualAccessService } from './individual-access.service';
@Global()
@Module({
  imports: [PrismaModule],
  providers: [IndividualAccessService],
  exports: [IndividualAccessService],
})
export class IndividualAccessModule {}
