import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class AssignUxVariantDto {
  @IsString()
  @IsIn(['A', 'B', 'C', 'DEFAULT'])
  variant: 'A' | 'B' | 'C' | 'DEFAULT';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];
}

