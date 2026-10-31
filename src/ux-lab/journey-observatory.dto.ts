import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
export class JourneyMapQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90]) days?: number;
  @IsOptional() @Type(() => Number) @IsIn([3, 7, 14]) idleDays?: number;
  @IsOptional() @IsUUID('4') groupId?: string;
  @IsOptional() @IsUUID('4') userId?: string;
}
export class JourneyObservationQuery {
  @IsOptional() @IsString() @Length(1, 50) nodeCode?: string;
  @IsOptional() @IsUUID('4') groupId?: string;
  @IsOptional() @IsUUID('4') userId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page?: number;
}
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class JourneyObservationDto extends JourneyMapQuery {
  @IsString() @Length(1, 50) nodeCode: string;
  @Transform(trim) @IsString() @Length(3, 140) title: string;
  @Transform(trim) @IsString() @Length(10, 1500) hypothesis: string;
  @Transform(trim) @IsString() @Length(5, 700) nextAction: string;
  @IsIn(['FRICTION', 'OPPORTUNITY', 'QUESTION']) category: string;
  @IsOptional() @IsUUID('4') ownerId?: string | null;
}
export class JourneyObservationStatusDto {
  @IsIn(['OPEN', 'VALIDATING', 'RESOLVED']) status: string;
  @IsDateString() expectedUpdatedAt: string;
}
