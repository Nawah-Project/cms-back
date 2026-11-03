import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsUUID, Min } from 'class-validator';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { SessionGuard } from '../platform/access/session.guard';
import { AdministratorGuard } from '../platform/access/administrator.guard';
import { AdminAccess, hasAdminAccess } from '../platform/access/admin-access';
import { FounderWorkspaceService } from './workspace.service';
import type { WorkspaceActor } from './workspace.port';
import { founderTemplate } from './domain/template';

class CreateWorkspaceDto {
  @IsUUID() requestId!: string;
  @IsObject() document!: Record<string, unknown>;
}
class UpdateWorkspaceDto extends CreateWorkspaceDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
interface WorkspaceRequest extends Request {
  administrator: WorkspaceActor & { permissions: unknown };
}
@Controller('admin/founder-workspace')
@UseGuards(ThrottlerGuard, SessionGuard, AdministratorGuard)
@AdminAccess('FOUNDER_WORKSPACE')
export class FounderWorkspaceController {
  constructor(private readonly service: FounderWorkspaceService) {}
  @Get('access') @Header('Cache-Control', 'private, no-store')
  access(@Req() req: WorkspaceRequest) { return { actorId: req.administrator.id, canWrite: hasAdminAccess(req.administrator.permissions, ['FOUNDER_WORKSPACE'], 'WRITE', req.administrator.isRoot) }; }
  @Get('template') @Header('Cache-Control', 'private, no-store')
  template() { return founderTemplate; }
  @Get('plans') @Header('Cache-Control', 'private, no-store')
  async list(@Req() req: WorkspaceRequest) { return { items: await this.service.list(req.administrator) }; }
  @Get('plans/:id') @Header('Cache-Control', 'private, no-store')
  get(@Req() req: WorkspaceRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(req.administrator, id); }
  @Post('plans') @Header('Cache-Control', 'private, no-store')
  create(@Req() req: WorkspaceRequest, @Body() dto: CreateWorkspaceDto) { return this.service.create(req.administrator, dto.requestId, dto.document); }
  @Patch('plans/:id') @Header('Cache-Control', 'private, no-store')
  update(@Req() req: WorkspaceRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkspaceDto) { return this.service.update(req.administrator, id, dto.requestId, dto.expectedRevision, dto.document); }
}
