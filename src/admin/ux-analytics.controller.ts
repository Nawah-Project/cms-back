import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TrackUxEventDto } from './dto/track-ux-event.dto';
import { UxAnalyticsService } from './ux-analytics.service';

@Controller('ux-analytics')
@UseGuards(JwtAuthGuard)
export class UxAnalyticsController {
  constructor(private readonly uxAnalytics: UxAnalyticsService) {}

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  recordEvent(@CurrentUser('id') userId: string, @Body() dto: TrackUxEventDto) {
    const event = this.uxAnalytics.recordEvent(userId, dto);
    return {
      success: true,
      event,
    };
  }
}
