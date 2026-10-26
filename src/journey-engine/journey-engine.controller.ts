import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSideTaskDto } from './dto/create-side-task.dto';
import { UpdateJourneyNodeDto } from './dto/update-journey-node.dto';
import { JourneyEngineService } from './journey-engine.service';

@Controller('journey')
@UseGuards(JwtAuthGuard)
export class JourneyEngineController {
  constructor(private readonly journeyEngine: JourneyEngineService) {}

  @Get('reports')
  getReports(@CurrentUser('id') userId: string) { return this.journeyEngine.getReports(userId); }

  @Post('final-report/complete')
  completeFinal(@CurrentUser('id') userId: string) { return this.journeyEngine.completeFinalReport(userId); }

  @Get('state')
  getState(@CurrentUser('id') userId: string) {
    return this.journeyEngine.getJourneyStateSummary(userId);
  }

  @Post('insights/:code/read')
  markInsightRead(@CurrentUser('id') userId: string, @Param('code') code: string) {
    return this.journeyEngine.markInsightRead(userId, code);
  }

  @Post('side-tasks')
  @HttpCode(HttpStatus.CREATED)
  submitSideTask(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSideTaskDto,
  ) {
    return this.journeyEngine.submitSideTask(userId, dto);
  }

  @Get('side-tasks')
  getSideTasks(
    @CurrentUser('id') userId: string,
    @Query('week') week?: string,
    @Query('nodeCode') nodeCode?: string,
  ) {
    const parsedWeek =
      week !== undefined && week !== '' && !Number.isNaN(Number(week))
        ? Number(week)
        : undefined;
    return this.journeyEngine.getSideTasks(userId, {
      week: parsedWeek,
      nodeCode: nodeCode?.trim() || undefined,
    });
  }

  @Get('compass')
  getCompass(
    @CurrentUser('id') userId: string,
    @Query('location') location?: string,
  ) {
    return this.journeyEngine.getJobMarketCompass(userId, location);
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly journeyEngine: JourneyEngineService) {}

  @Get()
  getNotifications(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit =
      limit !== undefined && !Number.isNaN(Number(limit)) ? Number(limit) : 30;
    return this.journeyEngine.getUserNotifications(userId, parsedLimit);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.journeyEngine.markNotificationRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser('id') userId: string) {
    return this.journeyEngine.markAllNotificationsRead(userId);
  }
}

@Controller('admin/journey')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminJourneyController {
  constructor(private readonly journeyEngine: JourneyEngineService) {}

  @Get('reports/demo')
  getDemoReportPreview() {
    return { mode: 'DEMO' as const, report: this.journeyEngine.getDemoReports() };
  }

  @Get('reports/:userId')
  async getUserReportPreview(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return {
      mode: 'ACTUAL' as const,
      report: await this.journeyEngine.getAdminReportPreview(userId),
    };
  }

  @Get('nodes')
  getNodes() {
    return this.journeyEngine.getAdminJourneyNodes();
  }

  @Patch('nodes/:code')
  updateNode(
    @Param('code') code: string,
    @Body() dto: UpdateJourneyNodeDto,
  ) {
    return this.journeyEngine.updateJourneyNodeByCode(code, dto);
  }

  @Get('plot-guidance')
  getPlotGuidance() {
    return this.journeyEngine.getAdminPlotGuidance();
  }

  @Patch('plot-guidance/:code')
  updatePlotGuidance(
    @Param('code') code: string,
    @Body()
    dto: {
      title?: string;
      content?: string;
      promptTemplate?: string;
      tierLevel?: string;
    },
    @CurrentUser('id') authorId: string,
  ) {
    return this.journeyEngine.updateAdminPlotGuidance(code, dto, authorId);
  }

  @Post('plot-guidance')
  createPlotGuidance(
    @Body()
    dto: {
      code: string;
      title: string;
      content: string;
      promptTemplate?: string;
      tierLevel?: string;
    },
    @CurrentUser('id') authorId: string,
  ) {
    return this.journeyEngine.createAdminPlotGuidance(dto, authorId);
  }

  @Post('users/:userId/override-node')
  overrideUserNode(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body('nodeCode') nodeCode: string,
  ) {
    return this.journeyEngine.overrideUserJourneyNode(userId, nodeCode);
  }
}

