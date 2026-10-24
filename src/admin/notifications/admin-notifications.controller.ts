import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminNotificationsService,
  TargetMember,
} from './admin-notifications.service';
import {
  NotificationLogQueryDto,
  PreviewRecipientsDto,
  SendCustomNotificationDto,
  UpdateNotificationConfigDto,
} from './dto/admin-notifications.dto';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Post('test-email')
  sendTestEmail(@CurrentUser('id') adminUserId: string) {
    return this.service.sendTestEmail(adminUserId);
  }

  @Post('preview-recipients')
  previewRecipients(
    @Body() dto: PreviewRecipientsDto,
  ): Promise<{
    count: number;
    recipients: TargetMember[];
    members: TargetMember[];
  }> {
    return this.service.previewRecipients(dto);
  }

  @Post('send')
  sendCustomNotification(
    @CurrentUser('id') adminUserId: string,
    @Body() dto: SendCustomNotificationDto,
  ) {
    return this.service.sendCustomNotification(adminUserId, dto);
  }

  @Get('logs')
  getLogs(@Query() query: NotificationLogQueryDto) {
    return this.service.getLogs(query);
  }

  @Post('retry/:logId')
  retryLog(@Param('logId') logId: string) {
    return this.service.retryLog(logId);
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateNotificationConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Post('remind-unverified')
  remindUnverified() {
    return this.service.remindUnverified();
  }
}
