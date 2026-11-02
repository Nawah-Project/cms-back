import {
  IsDateString,
  IsInt,
  IsObject,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RequestDto } from './consulting.dto';
export class CreateRoadmapDto extends RequestDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsDateString() retentionUntil: string;
  @IsObject() content: Record<string, unknown>;
}
export class UpdateRoadmapDto extends RequestDto {
  @IsInt() @Min(1) revision: number;
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsObject() content: Record<string, unknown>;
}
