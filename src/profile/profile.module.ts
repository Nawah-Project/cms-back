import { GroupsModule } from '../members/groups.module';
import { GroupAssignmentService } from '../members/group-assignment.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileController } from './profile.controller';
import { CV_STORAGE_DIR } from './profile.constants';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, PrismaModule, GroupsModule],
  controllers: [ProfileController],
  providers: [
    {
      provide: ProfileService,
      useFactory: (
        prisma: PrismaService,
        storageDir: string,
        groups: GroupAssignmentService,
      ) => new ProfileService(prisma, storageDir, groups),
      inject: [PrismaService, 'CV_STORAGE_DIR', GroupAssignmentService],
    },
    { provide: 'CV_STORAGE_DIR', useValue: CV_STORAGE_DIR },
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
