import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MembersService } from './members.service';
import { RecentProgressQueryDto } from './dto/recent-progress-query.dto';

@Controller('members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('progress')
  getProgress(@CurrentUser('id') userId: string) {
    return this.members.getProgress(userId);
  }

  @Get('progress/recent')
  getRecentProgress(
    @CurrentUser('id') userId: string,
    @Query() query: RecentProgressQueryDto,
  ) {
    return this.members.getRecentProgress(userId, query.limit);
  }

  @Get('progress/activity')
  getActivity(
    @CurrentUser('id') userId: string,
    @Query() query: RecentProgressQueryDto,
  ) {
    return this.members.getActivity(userId, query.limit);
  }

  @Get('progress/:memberId')
  getMemberDetail(
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.members.getMemberDetail(userId, memberId);
  }
}
