import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GroupsModule } from '../members/groups.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [AdminController],
  providers: [AdminGuard, AdminService],
})
export class AdminModule {}
