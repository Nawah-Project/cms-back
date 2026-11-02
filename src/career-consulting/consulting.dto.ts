import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class RequestDto {
  @IsUUID() requestId: string;
}
export class CreateCaseDto extends RequestDto {
  @IsUUID() userId: string;
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsString() @MinLength(5) @MaxLength(3000) purpose: string;
  @IsDateString() retentionUntil: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('4', { each: true })
  allowedAdminIds?: string[];
}
export class CaseUpdateDto extends RequestDto {
  @IsInt() @Min(1) revision: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(3000) purpose?: string;
  @IsOptional() @IsDateString() retentionUntil?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('4', { each: true })
  allowedAdminIds?: string[];
}
export class StateDto extends RequestDto {
  @IsIn(['INVITE', 'PAUSE', 'RESUME', 'COMPLETE']) action: string;
}
export class ConsentDto extends RequestDto {
  @IsBoolean() confirmed: boolean;
  @IsString() @MaxLength(60) agreementVersion: string;
}
export class SharingDto extends RequestDto {
  @IsBoolean() enabled: boolean;
}
export class ItemDto extends RequestDto {
  @IsIn(['WORK', 'ACTIVITY', 'SESSION', 'RECOMMENDATION', 'EVIDENCE'])
  kind: string;
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsObject() data: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(12000) privateNotes?: string;
  @IsOptional() @IsIn(['ar', 'en']) language?: string;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class PublishDto extends RequestDto {
  @IsInt() @Min(1) revision: number;
}
export class ResponseDto extends RequestDto {
  @IsUUID() publicationId: string;
  @IsObject() answers: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUUID('4', { each: true })
  fileIds?: string[];
  @IsOptional() @IsInt() @Min(0) revision?: number;
}
export class ReviewDto extends RequestDto {
  @IsString() @MinLength(3) @MaxLength(10000) body: string;
  @IsString() @MaxLength(3000) nextStep: string;
  @IsOptional() @IsInt() @Min(0) revision?: number;
}
export class DecisionDto extends RequestDto {
  @IsUUID() publicationId: string;
  @IsIn(['PROCEED', 'REQUEST_CHANGE', 'DEFER']) choice: string;
  @IsString() @MaxLength(4000) body: string;
}
export class CommentDto extends RequestDto {
  @IsOptional() @IsUUID() targetId?: string;
  @IsIn(['CASE', 'PUBLICATION', 'SUBMISSION']) targetKind: string;
  @IsString() @MinLength(1) @MaxLength(6000) body: string;
  @IsOptional() @IsBoolean() private?: boolean;
}
export class FileDto extends RequestDto {}
export class ListDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'INVITED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN'])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}
