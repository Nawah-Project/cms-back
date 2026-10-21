import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { OutreachStatus, SideTaskType } from '@prisma/client';

export class CreateSideTaskDto {
  @IsEnum(SideTaskType)
  type: SideTaskType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nodeCode?: string;

  // LINKEDIN_POST fields
  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'postUrl must be a valid URL with http or https protocol' },
  )
  @MaxLength(2048)
  postUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  postTopic?: string;

  // OUTREACH_CONTACT fields
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactRole?: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'contactUrl must be a valid URL with http or https protocol' },
  )
  @MaxLength(2048)
  contactUrl?: string;

  @IsOptional()
  @IsEnum(OutreachStatus)
  outreachState?: OutreachStatus;

  // WEEKLY_REVIEW fields
  @IsOptional()
  @IsString()
  reviewSummary?: string;

  @IsOptional()
  @IsBoolean()
  newCvUploaded?: boolean;

  @IsOptional()
  @IsBoolean()
  sharedInGroup?: boolean;
}

