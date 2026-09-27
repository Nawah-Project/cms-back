import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminTasksController } from './admin-tasks.controller';
import {
  ProfessionalDevelopmentDashboardController,
  TasksController,
} from './tasks.controller';
import { TasksService } from './tasks.service';
import { FeedbackModule } from '../feedback/feedback.module';

@Module({
  imports: [AuthModule, FeedbackModule],
  controllers: [
    TasksController,
    AdminTasksController,
    ProfessionalDevelopmentDashboardController,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
