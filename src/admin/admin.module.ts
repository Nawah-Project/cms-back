import { AccountDeletionService } from "./account-deletion.service";
import { AccountCvCleanupService } from "./account-cv-cleanup.service";
import { PrismaService } from "../prisma/prisma.service";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GroupsModule } from "../members/groups.module";
import { ApplicationsModule } from "../applications/applications.module";
import { ProfileModule } from "../profile/profile.module";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { UxAnalyticsController } from "./ux-analytics.controller";
import { UxAnalyticsService } from "./ux-analytics.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminNotificationsController } from "./notifications/admin-notifications.controller";
import { AdminNotificationsService } from "./notifications/admin-notifications.service";

@Module({
  imports: [
    AuthModule,
    GroupsModule,
    PrismaModule,
    ApplicationsModule,
    ProfileModule,
  ],
  controllers: [
    AdminController,
    UxAnalyticsController,
    AdminNotificationsController,
  ],
  providers: [
    AdminGuard,
    AccountDeletionService,
    {
      provide: AccountCvCleanupService,
      useFactory: (prisma: PrismaService) =>
        new AccountCvCleanupService(prisma),
      inject: [PrismaService],
    },
    AdminService,
    UxAnalyticsService,
    AdminNotificationsService,
  ],
  exports: [UxAnalyticsService, AdminNotificationsService, AdminService],
})
export class AdminModule {}
