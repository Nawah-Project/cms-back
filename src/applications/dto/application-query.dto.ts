import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { ApplicationStage } from '../enums/application-stage.enum';
import { ApplicationOutcome } from '../enums/application-outcome.enum';

export class ApplicationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn([...Object.values(ApplicationStage), 'ACTIVE'])
  stage?: ApplicationStage | 'ACTIVE';

  @IsOptional()
  @IsEnum(ApplicationOutcome)
  outcome?: ApplicationOutcome;

  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
