import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MARKETING_EVENT_TYPES = [
  'SESSION_START',
  'PAGE_VIEW',
  'SIGNUP_COMPLETED',
  'ONBOARDING_COMPLETED',
] as const;

export class MarketingEventDto {
  @IsUUID('4') visitorId!: string;
  @IsUUID('4') sessionId!: string;
  @IsIn(MARKETING_EVENT_TYPES) type!: (typeof MARKETING_EVENT_TYPES)[number];
  @IsString() @MaxLength(300) path!: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(160) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(160) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(180) referrerHost?: string;
  @IsIn(['desktop', 'mobile', 'tablet']) deviceType!: string;
}

export class MarketingOverviewQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;
}
