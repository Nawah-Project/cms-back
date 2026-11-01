import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
export const CASE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
] as const;
export const RESOURCE_TYPES = [
  'FEATURE',
  'GUIDANCE',
  'WEEKLY_REPORT',
  'PERFORMANCE_ANALYTICS',
  'FINAL_REPORT',
  'PLAN_ITEM',
] as const;
export class RequestDto {
  @IsUUID() requestId: string;
}
export class CaseCreateDto extends RequestDto {
  @IsUUID() userId: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsString() @MinLength(5) @MaxLength(3000) goal: string;
  @IsString() @MinLength(5) @MaxLength(3000) hypothesis: string;
  @IsDateString() retentionUntil: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('4', { each: true })
  allowedAdminIds?: string[];
}
export class ReviewDto {
  @IsString() @MaxLength(6000) observedChange: string;
  @IsString() @MaxLength(6000) learning: string;
  @IsString() @MaxLength(6000) insufficientEvidence: string;
}
export class CaseUpdateDto extends RequestDto {
  @IsOptional() @IsIn(CASE_STATUSES) status?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(3000) goal?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(3000) hypothesis?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('4', { each: true })
  allowedAdminIds?: string[];
  @IsOptional() @IsString() @MaxLength(2000) nextStep?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsDateString() retentionUntil?: string;
  @IsOptional() @ValidateNested() @Type(() => ReviewDto) review?: ReviewDto;
}
export class ConsentDto extends RequestDto {
  @IsIn(['WRITTEN', 'VERBAL']) method: string;
  @IsDateString() consentAt: string;
  @IsBoolean() confirmed: boolean;
  @IsString() @MinLength(10) @MaxLength(2000) evidence: string;
}
export class SessionDto extends RequestDto {
  @IsIn(['CONSULTING', 'COACHING', 'RESEARCH']) kind: string;
  @IsDateString() heldAt: string;
  @IsString() @MinLength(3) @MaxLength(2000) goal: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  topics?: string[];
  @IsOptional() @IsString() @MaxLength(6000) participantStatements?: string;
  @IsOptional() @IsString() @MaxLength(6000) researcherObservations?: string;
  @IsOptional() @IsString() @MaxLength(3000) barriers?: string;
  @IsOptional() @IsString() @MaxLength(3000) hypotheses?: string;
  @IsOptional() @IsString() @MaxLength(3000) agreements?: string;
  @IsOptional() @IsString() @MaxLength(3000) nextActions?: string;
  @IsOptional() @IsString() @MaxLength(3000) outcome?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsIn(['PENDING', 'DONE', 'CANCELLED']) followUpStatus?: string;
}
export class ObservationDto extends RequestDto {
  @IsOptional() @IsUUID() sessionId?: string;
  @IsIn([
    'PARTICIPANT_STATEMENT',
    'RESEARCHER_OBSERVATION',
    'HYPOTHESIS',
    'ACTION',
    'OUTCOME',
  ])
  kind: string;
  @IsIn(['ABILITIES', 'USER_IMPACT', 'BUSINESS_IMPACT', 'OTHER']) lens: string;
  @IsString() @MinLength(1) @MaxLength(6000) content: string;
  @IsOptional() @IsString() @MaxLength(3000) evidence?: string;
  @IsIn(['NEEDS_EVIDENCE', 'OPEN', 'RESOLVED']) status: string;
  @IsOptional() @IsBoolean() isBarrier?: boolean;
}
export class PlanItemDto extends RequestDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) goal?: string;
  @IsOptional() @IsString() @MaxLength(3000) activity?: string;
  @IsString() @MinLength(3) @MaxLength(2000) completionCondition: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  resourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) nodeCode?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() feedbackId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}
export class PlanStatusDto extends RequestDto {
  @IsIn(['OPEN', 'DOING', 'DONE', 'BLOCKED']) status: string;
}
export class OverrideDto extends RequestDto {
  @IsIn(RESOURCE_TYPES) resourceType: string;
  @IsString() @MinLength(1) @MaxLength(100) resourceId: string;
  @IsIn(['VIEW', 'INTERACT']) permission: string;
  @IsString() @MinLength(5) @MaxLength(2000) reason: string;
  @IsDateString() startsAt: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
export class CaseQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(CASE_STATUSES) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class InterventionDto extends RequestDto {
  @IsIn(['TASK', 'FEEDBACK']) kind: string;
  @IsOptional() @IsUUID() existingId?: string;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsString() @MinLength(3) @MaxLength(3000) content: string;
  @IsBoolean() publishConfirmed: boolean;
}
export class SessionFollowUpDto extends RequestDto {
  @IsIn(['PENDING', 'DONE', 'CANCELLED']) followUpStatus: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsString() @MaxLength(3000) outcome?: string;
}
export class ObservationUpdateDto extends RequestDto {
  @IsIn(['NEEDS_EVIDENCE', 'OPEN', 'RESOLVED']) status: string;
  @IsOptional() @IsString() @MaxLength(3000) evidence?: string;
}
