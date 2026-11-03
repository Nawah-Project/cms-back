import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsUUID, Min } from 'class-validator';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { SessionGuard } from '../platform/access/session.guard';
import { AdministratorGuard } from '../platform/access/administrator.guard';
import { AdminAccess, hasAdminAccess } from '../platform/access/admin-access';
import { StrategicRelationshipsService } from './relationships.service';
import type { RelationshipsActor } from './relationships.port';
import { blank } from './domain/relationship-document';

class CreateWorkspaceDto {
  @IsUUID() requestId!: string;
  @IsObject() document!: Record<string, unknown>;
}
class UpdateWorkspaceDto extends CreateWorkspaceDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
interface WorkspaceRequest extends Request {
  administrator: RelationshipsActor & { permissions: unknown };
}
@Controller('admin/strategic-relationships')
@UseGuards(ThrottlerGuard, SessionGuard, AdministratorGuard)
@AdminAccess('STRATEGIC_RELATIONSHIPS')
export class StrategicRelationshipsController {
  constructor(private readonly service: StrategicRelationshipsService) {}
  @Get('access') @Header('Cache-Control', 'private, no-store')
  access(@Req() req: WorkspaceRequest) { return { actorId: req.administrator.id, canWrite: hasAdminAccess(req.administrator.permissions, ['STRATEGIC_RELATIONSHIPS'], 'WRITE', req.administrator.isRoot) }; }
  @Get('template') @Header('Cache-Control', 'private, no-store')
  template() { return blank('personal'); }
  @Get('workspaces') @Header('Cache-Control', 'private, no-store')
  async list(@Req() req: WorkspaceRequest) { return { items: await this.service.list(req.administrator) }; }
  @Get('workspaces/:id') @Header('Cache-Control', 'private, no-store')
  get(@Req() req: WorkspaceRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(req.administrator, id); }
  @Post('workspaces') @Header('Cache-Control', 'private, no-store')
  create(@Req() req: WorkspaceRequest, @Body() dto: CreateWorkspaceDto) { return this.service.create(req.administrator, dto.requestId, dto.document); }
  @Patch('workspaces/:id') @Header('Cache-Control', 'private, no-store')
  update(@Req() req: WorkspaceRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkspaceDto) { return this.service.update(req.administrator, id, dto.requestId, dto.expectedRevision, dto.document); }
}
