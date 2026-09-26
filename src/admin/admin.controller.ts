import {
  Controller,
  Body,
  Delete,
  Get,
  Param,
  Post,
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

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Delete('groups/:groupId/members/:userId')
  removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.admin.removeMember(groupId, userId);
  }

  @Post('users/:userId/group-assignment')
  assignUser(@Param('userId') userId: string, @Body() dto?: AssignUserDto) {
    return this.admin.assignUserToGroup(userId, dto?.groupId);
  }

  @Get('monitoring/overview')
  getOverview() {
    return this.admin.getOverview();
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
    return this.admin.getActivity(query.limit);
  }

  @Get('monitoring/users/:userId')
  getUserDetail(@Param('userId') userId: string) {
    return this.admin.getUserDetail(userId);
  }
}
