import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { AdminAccess } from '../admin/admin-access';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackQueryDto,
  UpdateFeedbackDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: FeedbackQueryDto) {
    return this.feedback.listForMember(userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.feedback.unreadCount(userId);
  }

  @Post(':id/read')
  markRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feedback.markRead(userId, id);
  }

  @Get(':id')
  getOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feedback.getForMember(userId, id);
  }
}

@Controller('admin/feedback')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('MENTORING')
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  create(@CurrentUser('id') authorId: string, @Body() dto: CreateFeedbackDto) {
    return this.feedback.create(authorId, dto);
  }

  @Get()
  list(@Query() query: AdminFeedbackQueryDto) {
    return this.feedback.listForAdmin(query);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
  ) {
    return this.feedback.update(id, dto);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.archive(id);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.getForAdmin(id);
  }
}
