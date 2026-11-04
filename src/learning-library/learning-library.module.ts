import { Module } from '@nestjs/common';
import { PlatformAccessModule } from '../platform/access/platform-access.module';
import { LearningLibraryController } from './library.controller';
import { LibraryRepository } from './library.port';
import { PrismaLibraryRepository } from './infrastructure/prisma-library.repository';
import { LibraryFilesService } from './infrastructure/library-files.service';
@Module({
  imports: [PlatformAccessModule],
  controllers: [LearningLibraryController],
  providers: [
    { provide: LibraryRepository, useClass: PrismaLibraryRepository },
    LibraryFilesService,
  ],
})
export class LearningLibraryModule {}
