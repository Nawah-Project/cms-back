import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../members/groups.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { UxAnalyticsController } from './ux-analytics.controller';
import { UxAnalyticsService } from './ux-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, GroupsModule, PrismaModule],
  controllers: [AdminController, UxAnalyticsController],
  providers: [AdminGuard, AdminService, UxAnalyticsService],
  exports: [UxAnalyticsService],
})
export class AdminModule {}
