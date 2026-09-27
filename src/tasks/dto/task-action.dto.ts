import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TaskStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}

export class CreateChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class UpdateChecklistDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class UpdateChecklistDefinitionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;
}

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;
}
