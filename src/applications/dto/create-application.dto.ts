import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApplicationStage } from '../enums/application-stage.enum';
import { ApplicationOutcome } from '../enums/application-outcome.enum';
import { ApplicationMethod } from '../enums/application-method.enum';

export class CreateApplicationDto {
  @IsNotEmpty()
  @IsString()
  companyName: string;

  @IsNotEmpty()
  @IsString()
  jobTitle: string;

  @IsOptional()
  @IsDateString()
  applicationDate?: string;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(ApplicationMethod)
  applicationMethod?: ApplicationMethod;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @ValidateIf(
    (o, value) => value !== null && value !== undefined && value !== '',
  )
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'jobUrl must be a valid URL with http or https protocol' },
  )
  jobUrl?: string;

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
  @IsInt()
  @Min(0)
  @Max(4)
  journeyWeek?: number;

  @IsOptional()
  @IsBoolean()
  hasAssignment?: boolean;

  @IsOptional()
  @IsDateString()
  interviewDate?: string;

  @IsOptional()
  prepChecklist?: Record<string, unknown> | unknown[];

  @IsOptional()
  @IsString()
  interviewNotes?: string;

  @IsOptional()
  @IsBoolean()
  sharedWithGroup?: boolean;
}

