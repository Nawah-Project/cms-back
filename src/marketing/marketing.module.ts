import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminMarketingController,
  MarketingController,
} from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MarketingController, AdminMarketingController],
  providers: [MarketingService, AdminGuard],
})
export class MarketingModule {}
