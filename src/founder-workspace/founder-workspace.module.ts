import { Module } from '@nestjs/common';
import { PlatformAccessModule } from '../platform/access/platform-access.module';
import { FounderWorkspaceController } from './workspace.controller';
import { FounderWorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.port';
import { PrismaWorkspaceRepository } from './infrastructure/prisma-workspace.repository';

@Module({
  imports: [PlatformAccessModule],
  controllers: [FounderWorkspaceController],
  providers: [FounderWorkspaceService, { provide: WorkspaceRepository, useClass: PrismaWorkspaceRepository }],
})
export class FounderWorkspaceModule {}
