import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
  @Max(100_000)
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

  /** Free-text search on member name or email (case-insensitive). */
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(100)
  search?: string;

  /** Group UUID, or `UNASSIGNED` for members without a group. */
  @IsOptional()
  @IsString()
  @Matches(
    /^(UNASSIGNED|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  )
  groupId?: string;
}

export class MonitoringActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MONITORING_MAX_LIMIT)
  limit: number = ADMIN_MONITORING_DEFAULT_LIMIT;
}
