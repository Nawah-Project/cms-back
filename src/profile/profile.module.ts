import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileController } from './profile.controller';
import { CV_STORAGE_DIR } from './profile.constants';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfileController],
  providers: [
    {
      provide: ProfileService,
      useFactory: (prisma: PrismaService, storageDir: string) =>
        new ProfileService(prisma, storageDir),
      inject: [PrismaService, 'CV_STORAGE_DIR'],
    },
    { provide: 'CV_STORAGE_DIR', useValue: CV_STORAGE_DIR },
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
