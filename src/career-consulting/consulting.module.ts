import { ConsultingRoadmapController } from './roadmap.controller';
import { ConsultingRoadmapService } from './roadmap.service';
import { ProfileModule } from '../profile/profile.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminGuard } from '../admin/admin.guard';
import { CareerConsultingService } from './consulting.service';
import { ConsultingFilesService } from './consulting-files.service';
import {
  ConsultingAdminController,
  ConsultingMemberController,
} from './consulting.controller';
@Module({
  imports: [AuthModule, PrismaModule, ProfileModule],
  controllers: [
    ConsultingAdminController,
    ConsultingMemberController,
    ConsultingRoadmapController,
  ],
  providers: [
    CareerConsultingService,
    ConsultingFilesService,
    ConsultingRoadmapService,
    AdminGuard,
  ],
})
export class CareerConsultingModule {}
