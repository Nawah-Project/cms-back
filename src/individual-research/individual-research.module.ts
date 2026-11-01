import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { AdminGuard } from '../admin/admin.guard';
import { IndividualAccessModule } from './individual-access.module';
import { IndividualResearchService } from './individual-research.service';
import {
  IndividualResearchController,
  IndividualParticipationController,
} from './individual-research.controller';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TasksModule,
    FeedbackModule,
    IndividualAccessModule,
  ],
  controllers: [
    IndividualResearchController,
    IndividualParticipationController,
  ],
  providers: [IndividualResearchService, AdminGuard],
})
export class IndividualResearchModule {}
