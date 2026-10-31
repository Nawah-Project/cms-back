import { mailQuotaAlerts } from './operations.model';
import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminService } from '../admin/admin.service';
import { OperationsPolicyService } from './operations-policy.service';
import { OperationsCollectorService } from './operations-collector.service';
import { OperationsSettingsDto } from './operations.dto';
import { AdminAccess } from '../admin/admin-access';
class OperationsQuery {
  @IsOptional() @Type(() => Number) @IsIn([15, 60, 1440, 10080]) minutes = 1440;
}
@Controller('admin/operations')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('OPERATIONS')
export class OperationsController {
  constructor(
    private readonly policy: OperationsPolicyService,
    private readonly collector: OperationsCollectorService,
    private readonly admin: AdminService,
  ) {}
  @Get('overview') async overview(@Query() query: OperationsQuery) {
    const [dashboard, legacy] = await Promise.all([
      this.collector.dashboard(query.minutes),
      this.admin.getOperationsStats(),
    ]);
    return {
      ...dashboard,
      alerts: [...dashboard.alerts, ...mailQuotaAlerts(legacy.notifications)],
      mail: legacy.notifications,
      maintenance: legacy.noResponseProcessor,
    };
  }
  @Patch('settings') settings(
    @CurrentUser('id') id: string,
    @Body() body: OperationsSettingsDto,
  ) {
    return this.policy.update(id, body);
  }
}
