import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TrackUxEventDto } from './dto/track-ux-event.dto';
import { UxAnalyticsService } from './ux-analytics.service';

@Controller('ux-analytics')
export class UxAnalyticsController {
  constructor(
    private readonly uxAnalytics: UxAnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  getPublicConfig() {
    const config = this.uxAnalytics.getConfig();
    return {
      introVideoUrl: config.introVideoUrl,
      defaultVariant: config.defaultVariant,
    };
  }

  @Get('my-assignment')
  @UseGuards(JwtAuthGuard)
  async getMyAssignment(@CurrentUser('id') userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
      select: { groupId: true },
    });
    const groupId = membership?.groupId ?? null;
    const config = this.uxAnalytics.getConfig();

    return {
      assignedVariant: this.uxAnalytics.getVariantForGroup(groupId),
      groupId,
      introVideoUrl: config.introVideoUrl,
    };
  }

  @Post('events')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  recordEvent(@CurrentUser('id') userId: string, @Body() dto: TrackUxEventDto) {
    const event = this.uxAnalytics.recordEvent(userId, dto);
    return { success: true, event };
  }
}
