import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAccess } from '../admin/admin-access';
import { AdminGuard } from '../admin/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketingEventDto, MarketingOverviewQueryDto } from './marketing.dto';
import { MarketingService } from './marketing.service';

@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('events')
  event(@Body() body: MarketingEventDto, @Req() request: Request) {
    return this.marketing.record(body, {
      userAgent: request.get('user-agent') ?? '',
      country: request.get('cf-ipcountry') ?? null,
    });
  }
}

@Controller('admin/marketing')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('MARKETING')
export class AdminMarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('overview')
  overview(@Query() query: MarketingOverviewQueryDto) {
    return this.marketing.overview(query.days);
  }
}
