import { IsObject } from 'class-validator';

export class UpdateAdminAccessDto {
  @IsObject()
  permissions!: Record<string, unknown>;
}
