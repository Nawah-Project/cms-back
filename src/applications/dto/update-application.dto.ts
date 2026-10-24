import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ApplicationStage } from '../enums/application-stage.enum';
import { ApplicationOutcome } from '../enums/application-outcome.enum';
import { ApplicationMethod } from '../enums/application-method.enum';

export class UpdateApplicationDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  applicationDate?: string;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsOptional()
  @ValidateIf((o, value) => value !== null)
  @IsString()
  location?: string | null;

  @IsOptional()
  @ValidateIf((o, value) => value !== null)
  @IsEnum(ApplicationMethod)
  applicationMethod?: ApplicationMethod | null;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsOptional()
  @ValidateIf(
    (o, value) => value !== null && value !== undefined && value !== '',
  )
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'jobUrl must be a valid URL with http or https protocol' },
  )
  jobUrl?: string | null;

  @IsOptional()
  @IsEnum(ApplicationStage)
  stage?: ApplicationStage;

  @IsOptional()
  @IsEnum(ApplicationOutcome)
  outcome?: ApplicationOutcome;

  @IsOptional()
  @IsBoolean()
  isTailored?: boolean;

  @IsOptional()
  @IsBoolean()
  hasAssignment?: boolean;

  @IsOptional()
  @ValidateIf((o, value) => value !== null)
  @IsDateString()
  interviewDate?: string | null;

  @IsOptional()
  prepChecklist?: Record<string, unknown> | unknown[] | null;

  @IsOptional()
  @ValidateIf((o, value) => value !== null)
  @IsString()
  interviewNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  sharedWithGroup?: boolean;
}

