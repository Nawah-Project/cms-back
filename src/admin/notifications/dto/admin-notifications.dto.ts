import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export type TargetType = 'MEMBERS' | 'GROUP' | 'SMART_SEGMENT';
export type DeliveryChannel = 'EMAIL_AND_BELL' | 'EMAIL_ONLY' | 'BELL_ONLY';
export type SmartSegment =
  | 'TASK_0_STALLED'
  | 'INACTIVE_7_DAYS'
  | 'OVERDUE_TASKS'
  | 'UNASSIGNED_GROUP';

export class SendCustomNotificationDto {
  @IsNotEmpty()
  @IsIn(['MEMBERS', 'GROUP', 'SMART_SEGMENT'])
  targetType: TargetType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsIn([
    'TASK_0_STALLED',
    'INACTIVE_7_DAYS',
    'OVERDUE_TASKS',
    'UNASSIGNED_GROUP',
  ])
  smartSegment?: SmartSegment;

  @IsNotEmpty()
  @IsIn(['EMAIL_AND_BELL', 'EMAIL_ONLY', 'BELL_ONLY'])
  channel: DeliveryChannel;

  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaText?: string;
}

export class UpdateNotificationConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dailyEmailLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  monthlyEmailLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  otpSafeReserve?: number;

  @IsOptional()
  @IsBoolean()
  otpSafeReserveEnabled?: boolean;
}

export class NotificationLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  filter?: string; // "ALL", "MENTOR_DIRECT", "VERIFICATION_OTP", "SYSTEM_ANNOUNCEMENT", "FAILED"
}

export class PreviewRecipientsDto {
  @IsNotEmpty()
  @IsIn(['MEMBERS', 'GROUP', 'SMART_SEGMENT'])
  targetType: TargetType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsIn([
    'TASK_0_STALLED',
    'INACTIVE_7_DAYS',
    'OVERDUE_TASKS',
    'UNASSIGNED_GROUP',
  ])
  smartSegment?: SmartSegment;
}

