import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export const SUPPORTED_UX_EVENTS = [
  'onboarding_started',
  'onboarding_video_watched',
  'onboarding_completed',
  'application_created',
  'application_stage_updated',
  'task_status_changed',
  'feedback_read',
] as const;

export type SupportedUxEvent = (typeof SUPPORTED_UX_EVENTS)[number];

export class TrackUxEventDto {
  @IsString()
  @IsIn([...SUPPORTED_UX_EVENTS])
  name: SupportedUxEvent;

  @IsOptional()
  @IsIn(['A', 'B'])
  variant?: 'A' | 'B';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
