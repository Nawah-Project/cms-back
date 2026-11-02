import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { ListDto } from './consulting.dto';
import { CreateRoadmapDto, UpdateRoadmapDto } from './roadmap.dto';
import { ConsultingRoadmapService } from './roadmap.service';
@Controller('admin/career-consulting/roadmaps')
@UseGuards(JwtAuthGuard, AdminGuard)
@AdminAccess('CAREER_CONSULTING')
export class ConsultingRoadmapController {
  constructor(private readonly service: ConsultingRoadmapService) {}
  @Get('template') @Header('Cache-Control', 'private, no-store') template(
    @CurrentUser('id') actor: string,
  ) {
    return this.service.template(actor);
  }
  @Get() @Header('Cache-Control', 'private, no-store') list(
    @CurrentUser('id') actor: string,
    @Query() q: ListDto,
  ) {
    return this.service.list(actor, q.page);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') detail(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Post() create(
    @CurrentUser('id') actor: string,
    @Body() dto: CreateRoadmapDto,
  ) {
    return this.service.create(actor, dto);
  }
  @Patch(':id') update(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoadmapDto,
  ) {
    return this.service.update(actor, id, dto);
  }
  @Delete(':id') remove(
    @CurrentUser('id') actor: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(actor, id);
  }
}
