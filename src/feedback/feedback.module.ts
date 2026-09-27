import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import {
  AdminFeedbackController,
  FeedbackController,
} from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController, AdminFeedbackController],
  providers: [FeedbackService, AdminGuard],
  exports: [FeedbackService],
})
export class FeedbackModule {}
