import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { JourneyNodeType } from '@prisma/client';

export class UpdateJourneyNodeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  weekNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsEnum(JourneyNodeType)
  nodeType?: JourneyNodeType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  descriptionEn?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredAppsCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredTailoredCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredPostsCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredOutreachCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  unlocksInsightCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nextNodeCode?: string | null;
}

