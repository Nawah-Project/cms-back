import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { PrismaModule } from './prisma/prisma.module';
import { APP_FILTER } from '@nestjs/core';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import { AdminModule } from './admin/admin.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ApplicationsModule,
    MembersModule,
    AdminModule,
    ProfileModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
