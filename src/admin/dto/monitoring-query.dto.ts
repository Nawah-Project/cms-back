import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  ADMIN_MONITORING_DEFAULT_LIMIT,
  ADMIN_MONITORING_MAX_LIMIT,
} from '../admin.constants';
import type { ActivityStatus } from '../activity-status.util';

export class MonitoringQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MONITORING_MAX_LIMIT)
  limit = ADMIN_MONITORING_DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum({
    ACTIVE: 'ACTIVE',
    WARNING: 'WARNING',
    CRITICAL: 'CRITICAL',
    NEVER_ACTIVE: 'NEVER_ACTIVE',
  })
  activityStatus?: ActivityStatus;
}

export class MonitoringActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MONITORING_MAX_LIMIT)
  limit = ADMIN_MONITORING_DEFAULT_LIMIT;
}
