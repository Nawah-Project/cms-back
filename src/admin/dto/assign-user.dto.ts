import { IsOptional, IsUUID } from 'class-validator';

export class AssignUserDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
