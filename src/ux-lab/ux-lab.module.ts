import { HomeMemberController } from './home-member.controller';
import { HomeMemberService } from './home-member.service';
import { JourneyEngineModule } from '../journey-engine/journey-engine.module';
import { ProfileModule } from '../profile/profile.module';
import {
  HomePreviewController,
  HomePreviewService,
} from './home-preview.controller';
import { JourneyObservatoryService } from './journey-observatory.service';
import {
  JourneyMapQuery,
  JourneyObservationQuery,
  JourneyObservationDto,
  JourneyObservationStatusDto,
} from './journey-observatory.dto';
import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminGuard } from '../admin/admin.guard';
import {
  LabEventBatchDto,
  LabExperimentDto,
  LabReleaseDto,
  LabReportQuery,
  LabStatusDto,
} from './ux-lab.dto';
import { UxLabService } from './ux-lab.service';
@Controller('ux-lab')
@UseGuards(JwtAuthGuard)
class LabPublicController {
  constructor(private readonly lab: UxLabService) {}
  @Get('assignment') assignment(@CurrentUser('id') id: string) {
    return this.lab.assignment(id);
  }
  @Post('events') events(
    @CurrentUser('id') id: string,
    @Body() body: LabEventBatchDto,
  ) {
    return this.lab.record(id, body);
  }
}
@Controller('admin/ux-lab/v2')
@UseGuards(JwtAuthGuard, AdminGuard)
class LabAdminController {
  constructor(
    private readonly lab: UxLabService,
    private readonly observatory: JourneyObservatoryService,
  ) {}
  @Get('journey-map') journeyMap(@Query() query: JourneyMapQuery) {
    return this.observatory.map(query);
  }
  @Get('journey-observations') observations(
    @Query() query: JourneyObservationQuery,
  ) {
    return this.observatory.observations(query);
  }
  @Post('journey-observations') createObservation(
    @CurrentUser('id') id: string,
    @Body() body: JourneyObservationDto,
  ) {
    return this.observatory.createObservation(id, body);
  }
  @Patch('journey-observations/:id') observationStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: JourneyObservationStatusDto,
  ) {
    return this.observatory.updateObservation(id, body);
  }
  @Get('config') config() {
    return this.lab.config();
  }
  @Get('report') report(@Query() query: LabReportQuery) {
    return this.lab.report(query);
  }
  @Post('experiments') create(
    @CurrentUser('id') id: string,
    @Body() body: LabExperimentDto,
  ) {
    return this.lab.create(id, body);
  }
  @Patch('experiments/:id') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LabStatusDto,
  ) {
    return this.lab.transition(id, body.status);
  }
  @Post('releases/:section') release(
    @CurrentUser('id') id: string,
    @Param('section') section: string,
    @Body() body: LabReleaseDto,
  ) {
    return this.lab.publish(id, section, body);
  }
}
@Module({
  imports: [PrismaModule, AuthModule, JourneyEngineModule, ProfileModule],
  controllers: [
    LabPublicController,
    LabAdminController,
    HomePreviewController,
    HomeMemberController,
  ],
  providers: [
    UxLabService,
    HomeMemberService,
    JourneyObservatoryService,
    HomePreviewService,
    AdminGuard,
  ],
})
export class UxLabModule {}
