import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssignUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;
}
