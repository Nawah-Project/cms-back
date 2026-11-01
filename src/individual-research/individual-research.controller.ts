import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AdminAccess } from '../admin/admin-access';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IndividualResearchService } from './individual-research.service';
import {
  CaseCreateDto,
  CaseQueryDto,
  CaseUpdateDto,
  ConsentDto,
  InterventionDto,
  ObservationDto,
  OverrideDto,
  PlanItemDto,
  PlanStatusDto,
  RequestDto,
  SessionDto,
  SessionFollowUpDto,
  ObservationUpdateDto,
} from './individual-research.dto';
@Controller('admin/individual-research')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('INDIVIDUAL_RESEARCH')
export class IndividualResearchController {
  constructor(private readonly studio: IndividualResearchService) {}
  @Get('candidates') @AdminAccess('INDIVIDUAL_RESEARCH', 'WRITE') candidates(
    @CurrentUser('id') actor: string,
    @Query('search') search?: string,
  ) {
    return this.studio.candidates(actor, search?.slice(0, 120));
  }
  @Get('staff') staff(@CurrentUser('id') actor: string) {
    return this.studio.staff(actor);
  }
  @Get('cases') list(
    @CurrentUser('id') actor: string,
    @Query() q: CaseQueryDto,
  ) {
    return this.studio.list(actor, q);
  }
  @Post('cases') create(
    @CurrentUser('id') actor: string,
    @Body() d: CaseCreateDto,
  ) {
    return this.studio.create(actor, d);
  }
  @Get('cases/:id') detail(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studio.detail(actor, id);
  }
  @Patch('cases/:id') update(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CaseUpdateDto,
  ) {
    return this.studio.update(actor, id, d);
  }
  @Delete('cases/:id') remove(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studio.remove(actor, id);
  }
  @Post('cases/:id/consent') consent(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ConsentDto,
  ) {
    return this.studio.consent(actor, id, d);
  }
  @Post('cases/:id/withdraw') withdraw(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RequestDto,
  ) {
    return this.studio.withdraw(actor, id, d.requestId);
  }
  @Post('cases/:id/sessions') session(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: SessionDto,
  ) {
    return this.studio.session(actor, id, d);
  }
  @Post('cases/:id/observations') observation(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ObservationDto,
  ) {
    return this.studio.observation(actor, id, d);
  }
  @Patch('cases/:id/sessions/:sessionId') sessionFollowUp(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() d: SessionFollowUpDto,
  ) {
    return this.studio.sessionFollowUp(actor, id, sessionId, d);
  }
  @Patch('cases/:id/observations/:observationId') observationUpdate(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('observationId', ParseUUIDPipe) observationId: string,
    @Body() d: ObservationUpdateDto,
  ) {
    return this.studio.observationUpdate(actor, id, observationId, d);
  }
  @Post('cases/:id/plan') plan(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PlanItemDto,
  ) {
    return this.studio.plan(actor, id, d);
  }
  @Patch('cases/:id/plan/:itemId') planStatus(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() d: PlanStatusDto,
  ) {
    return this.studio.planStatus(actor, id, itemId, d.requestId, d.status);
  }
  @Post('cases/:id/interventions') intervention(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: InterventionDto,
  ) {
    return this.studio.intervention(actor, id, d);
  }
  @Post('cases/:id/overrides') grant(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: OverrideDto,
  ) {
    return this.studio.grant(actor, id, d);
  }
  @Post('cases/:id/overrides/:overrideId/revoke') revoke(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
    @Body() d: RequestDto,
  ) {
    return this.studio.revoke(actor, id, overrideId, d.requestId);
  }
}
@Controller('individual-research/participation')
@UseGuards(JwtAuthGuard)
export class IndividualParticipationController {
  constructor(private readonly studio: IndividualResearchService) {}
  @Get() list(@CurrentUser('id') userId: string) {
    return this.studio.participation(userId);
  }
  @Post(':id/withdraw') withdraw(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RequestDto,
  ) {
    return this.studio.withdraw(userId, id, d.requestId, true);
  }
}
