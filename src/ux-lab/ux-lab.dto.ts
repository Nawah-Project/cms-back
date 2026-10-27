import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ACTIONS, LAB_EVENTS, SECTIONS } from './registry';
export class LabExperimentDto {
  @IsString() @Length(3, 120) title: string;
  @IsString() @Length(10, 1000) hypothesis: string;
  @IsIn(SECTIONS) section: string;
  @IsIn(['ALL', 'GROUPS', 'USERS']) audience: string;
  @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) groupIds: string[];
  @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) userIds: string[];
  @IsInt() @Min(10) @Max(90) allocation: number;
  @IsIn(ACTIONS) primaryMetric: string;
  @IsInt() @Min(10) @Max(10000) minSample: number;
}
export class LabStatusDto {
  @IsIn(['RUNNING', 'PAUSED', 'COMPLETED']) status: string;
}
export class LabReleaseDto {
  @IsIn(['A', 'B']) version: string;
  @IsString() @Length(1, 100) expectedContext: string;
}
export class LabEventDto {
  @IsUUID('4') id: string;
  @IsUUID('4') sessionId: string;
  @IsIn(SECTIONS) section: string;
  @IsIn(['A', 'B']) version: string;
  @IsString() @Length(1, 100) context: string;
  @IsIn(LAB_EVENTS) name: string;
  @IsOptional() @IsInt() @Min(0) @Max(15) duration?: number;
}
export class LabEventBatchDto {
  @IsUUID('4') accountId: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LabEventDto)
  events: LabEventDto[];
}
export class LabReportQuery {
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90]) days?: number;
  @IsOptional() @IsUUID('4') groupId?: string;
  @IsOptional() @IsUUID('4') experimentId?: string;
}
