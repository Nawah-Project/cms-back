import { Module } from '@nestjs/common';
import { PlatformAccessModule } from '../platform/access/platform-access.module';
import { StrategicRelationshipsController } from './relationships.controller';
import { StrategicRelationshipsService } from './relationships.service';
import { RelationshipsRepository } from './relationships.port';
import { PrismaRelationshipsRepository } from './infrastructure/prisma-relationships.repository';

@Module({
  imports: [PlatformAccessModule],
  controllers: [StrategicRelationshipsController],
  providers: [StrategicRelationshipsService, { provide: RelationshipsRepository, useClass: PrismaRelationshipsRepository }],
})
export class StrategicRelationshipsModule {}
