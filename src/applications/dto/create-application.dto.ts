import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(ApplicationMethod)
  applicationMethod?: ApplicationMethod;

  @IsOptional()
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
}
