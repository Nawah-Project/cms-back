import { OperationsModule } from '../operations/operations.module';
import { OperationsPolicyService } from '../operations/operations-policy.service';
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
  imports: [OperationsModule, AuthModule, PrismaModule, GroupsModule],
  controllers: [ProfileController],
  providers: [
    {
      provide: ProfileService,
      useFactory: (
        prisma: PrismaService,
        storageDir: string,
        groups: GroupAssignmentService,
        operations: OperationsPolicyService,
      ) => new ProfileService(prisma, storageDir, groups, operations),
      inject: [
        PrismaService,
        'CV_STORAGE_DIR',
        GroupAssignmentService,
        OperationsPolicyService,
      ],
    },
    { provide: 'CV_STORAGE_DIR', useValue: CV_STORAGE_DIR },
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
