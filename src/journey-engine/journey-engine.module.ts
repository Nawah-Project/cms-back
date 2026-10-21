import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../members/groups.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminJourneyController,
  JourneyEngineController,
  NotificationsController,
} from './journey-engine.controller';
import { JourneyEngineService } from './journey-engine.service';
import { JourneyProgressionListener } from './journey-progression.listener';

@Module({
  imports: [PrismaModule, AuthModule, GroupsModule],
  controllers: [
    JourneyEngineController,
    NotificationsController,
    AdminJourneyController,
  ],
  providers: [JourneyEngineService, JourneyProgressionListener, AdminGuard],
  exports: [JourneyEngineService],
})
export class JourneyEngineModule {}

