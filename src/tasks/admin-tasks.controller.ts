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
import { AdminGuard } from '../admin/admin.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  CreateChecklistDto,
  CreateNoteDto,
  UpdateChecklistDefinitionDto,
} from './dto/task-action.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('users/:userId/tasks')
  create(
    @CurrentUser('id') adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.createForMember(userId, adminId, dto);
  }

  @Post('groups/:groupId/tasks')
  createForGroup(
    @CurrentUser('id') adminId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.createForGroup(groupId, adminId, dto);
  }

  @Get('users/:userId/tasks')
  list(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: TaskQueryDto,
  ) {
    return this.tasks.findForAdmin(userId, query.page, query.limit);
  }

  @Get('tasks/:taskId')
  getOne(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.findOneForAdmin(taskId);
  }

  @Patch('tasks/:taskId')
  update(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.updateForAdmin(taskId, dto);
  }

  @Delete('tasks/:taskId')
  remove(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.deleteForAdmin(taskId);
  }

  @Post('tasks/:taskId/checklist')
  addChecklist(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateChecklistDto,
  ) {
    return this.tasks.addChecklistItemForAdmin(taskId, dto);
  }

  @Patch('tasks/:taskId/checklist/:itemId')
  updateChecklist(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistDefinitionDto,
  ) {
    return this.tasks.updateChecklistItemForAdmin(taskId, itemId, dto);
  }

  @Delete('tasks/:taskId/checklist/:itemId')
  deleteChecklist(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.tasks.deleteChecklistItemForAdmin(taskId, itemId);
  }

  @Post('tasks/:taskId/feedback')
  addFeedback(
    @CurrentUser('id') adminId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.tasks.addMentorFeedback(adminId, taskId, dto);
  }

  @Get('tasks/:taskId/feedback')
  listFeedback(@Param('taskId', ParseUUIDPipe) taskId: string) {
    return this.tasks.listNotesForAdmin(taskId);
  }
}
