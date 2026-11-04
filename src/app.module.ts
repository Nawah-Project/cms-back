import { LearningLibraryModule } from './learning-library/learning-library.module';
import { StrategicRelationshipsModule } from './strategic-relationships/strategic-relationships.module';
import { FounderWorkspaceModule } from './founder-workspace/founder-workspace.module';
import { CareerConsultingModule } from './career-consulting/consulting.module';
import { OperationsModule } from './operations/operations.module';
import { UxLabModule } from './ux-lab/ux-lab.module';
import { Module } from '@nestjs/common';
import { ExperienceModule } from './experience/experience.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { TasksModule } from './tasks/tasks.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ObservabilityModule } from './observability/observability.module';
import { JourneyEngineModule } from './journey-engine/journey-engine.module';
import { MarketingModule } from './marketing/marketing.module';

@Module({
  imports: [
    ...(process.env.LEARNING_LIBRARY_ENABLED === 'false' ? [] : [LearningLibraryModule]),
    ...(process.env.STRATEGIC_RELATIONSHIPS_ENABLED === 'false' ? [] : [StrategicRelationshipsModule]),
    ...(process.env.FOUNDER_WORKSPACE_ENABLED === 'false' ? [] : [FounderWorkspaceModule]),
    CareerConsultingModule,
    OperationsModule,
    ExperienceModule,
    UxLabModule,
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    ApplicationsModule,
    MembersModule,
    AdminModule,
    ProfileModule,
    TasksModule,
    FeedbackModule,
    ObservabilityModule,
    JourneyEngineModule,
    MarketingModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
