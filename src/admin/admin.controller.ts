import {
  Controller,
  Body,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AssignUserDto } from './dto/assign-user.dto';
import {
  MonitoringActivityQueryDto,
  MonitoringQueryDto,
} from './dto/monitoring-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateUxConfigDto } from './dto/track-ux-event.dto';
import { AssignUxVariantDto } from './dto/assign-ux-variant.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto) {
    return this.admin.createGroup(dto.name);
  }

  @Delete('groups/:groupId/members/:userId')
  removeMember(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.admin.removeMember(groupId, userId);
  }

  @Post('users/:userId/group-assignment')
  assignUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto?: AssignUserDto,
  ) {
    return this.admin.assignUserToGroup(userId, dto?.groupId);
  }

  @Get('monitoring/overview')
  getOverview() {
    return this.admin.getOverview();
  }

  @Get('monitoring/attention')
  getAttention(@Query() query: MonitoringActivityQueryDto) {
    return this.admin.getAttention(query.limit);
  }

  @Get('monitoring/users')
  getUsers(@Query() query: MonitoringQueryDto) {
    return this.admin.getUsers(query);
  }

  @Get('monitoring/groups')
  getGroups() {
    return this.admin.getGroups();
  }

  @Get('monitoring/activity')
  getActivity(@Query() query: MonitoringActivityQueryDto) {
    return this.admin.getActivity(query.page, query.limit);
  }

  @Get('monitoring/users/:userId')
  getUserDetail(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.admin.getUserDetail(userId);
  }

  @Get('monitoring/ux-analytics')
  getUxAnalytics() {
    return this.admin.getUxAnalytics();
  }

  @Patch('monitoring/ux-config')
  updateUxConfig(@Body() dto: UpdateUxConfigDto) {
    return this.admin.updateUxConfig(dto);
  }

  @Get('monitoring/granular-funnel')
  getGranularFunnel() {
    return this.admin.getGranularFunnel();
  }

  @Get('ux-lab/overview')
  getUxLabOverview() {
    return this.admin.getUxLabOverview();
  }

  @Patch('ux-lab/variants/assign')
  assignUxVariants(@Body() dto: AssignUxVariantDto) {
    return this.admin.assignUxVariants(dto);
  }

  @Get('operations/stats')
  getOperationsStats() {
    return this.admin.getOperationsStats();
  }

  @Post('operations/run-no-response-processor')
  runNoResponseProcessor() {
    return this.admin.runNoResponseProcessor();
  }

  @Post('operations/cleanup-orphaned-files')
  cleanupOrphanedFiles() {
    return this.admin.cleanupOrphanedFiles();
  }

  @Post('users/:userId/journey-node')
  overrideJourneyNode(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body('nodeCode') nodeCode: string,
  ) {
    return this.admin.overrideJourneyNode(userId, nodeCode);
  }
}
