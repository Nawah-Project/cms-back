import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  portfolioUrl?: string | null;
}
