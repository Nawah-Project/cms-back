import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const SUPPORTED_UX_EVENTS = [
  'onboarding_started',
  'onboarding_video_watched',
  'onboarding_completed',
  'application_created',
  'application_stage_updated',
  'task_status_changed',
  'feedback_read',
  'tour_completed',
  'job_explorer_clicked',
  'prompt_copied',
] as const;

export type SupportedUxEvent = (typeof SUPPORTED_UX_EVENTS)[number];
export type ExperimentVariant = 'A' | 'B' | 'C';

export class TrackUxEventDto {
  @IsString()
  @IsIn([...SUPPORTED_UX_EVENTS])
  name: SupportedUxEvent;

  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  variant?: ExperimentVariant;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateUxConfigDto {
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  defaultVariant?: ExperimentVariant;

  @IsOptional()
  @IsObject()
  groupVariants?: Record<string, ExperimentVariant>;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  introVideoUrl?: string;
}
