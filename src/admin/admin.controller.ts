import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountDeletionService } from './account-deletion.service';
import { DeleteUserDto } from './dto/delete-user.dto';
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
import { AdminAccess } from './admin-access';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly accounts: AccountDeletionService,
  ) {}

  @Get('users/:userId/deletion-preview')
  @AdminAccess('COMMUNITY')
  deletionPreview(
    @CurrentUser('id') actorId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.accounts.preview(actorId, userId);
  }

  @Delete('users/:userId')
  @AdminAccess('COMMUNITY')
  deleteUser(
    @CurrentUser('id') actorId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: DeleteUserDto,
  ) {
    return this.accounts.delete(actorId, userId, dto);
  }

  @Post('groups')
  @AdminAccess('COMMUNITY')
  createGroup(@Body() dto: CreateGroupDto) {
    return this.admin.createGroup(dto.name);
  }

  @Delete('groups/:groupId/members/:userId')
  @AdminAccess('COMMUNITY')
  removeMember(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.admin.removeMember(groupId, userId);
  }

  @Post('users/:userId/group-assignment')
  @AdminAccess('COMMUNITY')
  assignUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto?: AssignUserDto,
  ) {
    return this.admin.assignUserToGroup(userId, dto?.groupId);
  }

  @Get('monitoring/overview')
  @AdminAccess('OVERVIEW')
  getOverview() {
    return this.admin.getOverview();
  }

  @Get('monitoring/attention')
  @AdminAccess('OVERVIEW')
  getAttention(@Query() query: MonitoringActivityQueryDto) {
    return this.admin.getAttention(query.limit);
  }

  @Get('monitoring/users')
  @AdminAccess(['COMMUNITY', 'MENTORING', 'REPORTS', 'UX_LAB'])
  getUsers(@Query() query: MonitoringQueryDto) {
    return this.admin.getUsers(query);
  }

  @Get('monitoring/groups')
  @AdminAccess(['COMMUNITY', 'MENTORING', 'UX_LAB'])
  getGroups() {
    return this.admin.getGroups();
  }

  @Get('monitoring/activity')
  @AdminAccess('COMMUNITY')
  getActivity(@Query() query: MonitoringActivityQueryDto) {
    return this.admin.getActivity(query.page, query.limit);
  }

  @Get('monitoring/users/:userId')
  @AdminAccess(['COMMUNITY', 'MENTORING', 'REPORTS', 'UX_LAB'])
  getUserDetail(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.admin.getUserDetail(userId);
  }

  @Get('monitoring/ux-analytics')
  @AdminAccess('UX_LAB')
  getUxAnalytics() {
    return this.admin.getUxAnalytics();
  }

  @Patch('monitoring/ux-config')
  @AdminAccess('UX_LAB')
  updateUxConfig(@Body() dto: UpdateUxConfigDto) {
    return this.admin.updateUxConfig(dto);
  }

  @Get('monitoring/granular-funnel')
  @AdminAccess(['OVERVIEW', 'UX_LAB'])
  getGranularFunnel() {
    return this.admin.getGranularFunnel();
  }

  @Get('ux-lab/overview')
  @AdminAccess('UX_LAB')
  getUxLabOverview() {
    return this.admin.getUxLabOverview();
  }

  @Get('ux-lab/event-trends')
  @AdminAccess('UX_LAB')
  getUxEventTrends(@Query('days') days?: string) {
    return this.admin.getUxEventTrends(Number(days) || 30);
  }

  @Get('monitoring/ux-lab-overview')
  @AdminAccess('UX_LAB')
  getUxLabOverviewAlias() {
    return this.admin.getUxLabOverview();
  }

  @Patch('ux-lab/variants/assign')
  @AdminAccess('UX_LAB')
  assignUxVariants(@Body() dto: AssignUxVariantDto) {
    return this.admin.assignUxVariants(dto);
  }

  @Patch('monitoring/ux-variants/assign')
  @AdminAccess('UX_LAB')
  assignUxVariantsAlias(@Body() dto: AssignUxVariantDto) {
    return this.admin.assignUxVariants(dto);
  }

  @Get('operations/stats')
  @AdminAccess(['OVERVIEW', 'OPERATIONS'])
  getOperationsStats() {
    return this.admin.getOperationsStats();
  }

  @Post('operations/run-no-response-processor')
  @AdminAccess('OPERATIONS')
  runNoResponseProcessor() {
    return this.admin.runNoResponseProcessor();
  }

  @Post('operations/cleanup-orphaned-files')
  @AdminAccess('OPERATIONS')
  cleanupOrphanedFiles() {
    return this.admin.cleanupOrphanedFiles();
  }

  @Post('users/:userId/journey-node')
  @AdminAccess('JOURNEY')
  overrideJourneyNode(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body('nodeCode') nodeCode: string,
  ) {
    return this.admin.overrideJourneyNode(userId, nodeCode);
  }
}
