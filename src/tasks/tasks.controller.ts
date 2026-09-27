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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateChecklistDto,
  CreateNoteDto,
  UpdateChecklistDto,
  UpdateTaskStatusDto,
} from './dto/task-action.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  findMine(@CurrentUser('id') userId: string, @Query() query: TaskQueryDto) {
    return this.tasks.findMine(userId, query.page, query.limit);
  }

  @Get('dashboard')
  getDashboardSummary(@CurrentUser('id') userId: string) {
    return this.tasks.getDashboardSummary(userId);
  }

  @Get(':taskId')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasks.findForMember(userId, taskId);
  }

  @Patch(':taskId/status')
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasks.updateStatus(userId, taskId, dto.status);
  }

  @Post(':taskId/checklist')
  addChecklist(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateChecklistDto,
  ) {
    return this.tasks.addChecklistItem(userId, taskId, dto);
  }

  @Patch(':taskId/checklist/:itemId')
  updateChecklist(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.tasks.updateChecklistItem(userId, taskId, itemId, dto);
  }

  @Delete(':taskId/checklist/:itemId')
  deleteChecklist(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.tasks.deleteChecklistItem(userId, taskId, itemId);
  }

  @Post(':taskId/notes')
  addPersonalNote(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.tasks.addPersonalNote(userId, taskId, dto);
  }

  @Get(':taskId/notes')
  listNotes(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasks.listNotes(userId, taskId);
  }

  @Patch(':taskId/notes/:noteId/read')
  markFeedbackRead(
    @CurrentUser('id') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.tasks.markFeedbackRead(userId, taskId, noteId);
  }
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class ProfessionalDevelopmentDashboardController {
  constructor(private readonly tasks: TasksService) {}

  @Get('professional-development')
  getSummary(@CurrentUser('id') userId: string) {
    return this.tasks.getDashboardSummary(userId);
  }
}
