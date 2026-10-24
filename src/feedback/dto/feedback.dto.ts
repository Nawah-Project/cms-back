import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsInt,
  IsIn,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FeedbackContext,
  FeedbackTag,
  FeedbackVisibility,
} from '@prisma/client';

export class FeedbackResourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class CreateFeedbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content: string;

  @IsEnum(FeedbackVisibility)
  visibility: FeedbackVisibility;

  @IsOptional()
  @IsUUID()
  targetUserId?: string | null;

  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsEnum(FeedbackContext)
  context?: FeedbackContext;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsEnum(FeedbackTag, { each: true })
  tags?: FeedbackTag[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FeedbackResourceDto)
  resource?: FeedbackResourceDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackResourceDto)
  resources?: FeedbackResourceDto[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unlockTriggerCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  promptTemplate?: string | null;

  @IsOptional()
  sendEmailNotification?: boolean;
}

export class UpdateFeedbackDto extends PartialType(CreateFeedbackDto) {}

export class FeedbackQueryDto {
  @IsOptional()
  @IsIn(['for-you', 'shared'])
  scope?: 'for-you' | 'shared';

  @IsOptional()
  @IsIn(['guidance', 'member'])
  kind?: 'guidance' | 'member';

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminFeedbackQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  archived?: string;

  @IsOptional()
  @IsIn(['guidance', 'member'])
  kind?: 'guidance' | 'member';
}
