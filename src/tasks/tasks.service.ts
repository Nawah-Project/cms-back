import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskNoteType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  CreateChecklistDto,
  CreateNoteDto,
  UpdateChecklistDto,
  UpdateChecklistDefinitionDto,
} from './dto/task-action.dto';

const taskInclude = {
  checklist: {
    orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  notes: {
    where: { type: TaskNoteType.MENTOR_FEEDBACK },
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      taskId: true,
      authorId: true,
      type: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      readAt: true,
    },
  },
  _count: {
    select: {
      notes: { where: { type: TaskNoteType.MENTOR_FEEDBACK, readAt: null } },
    },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTaskForUser(taskId: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async assertTaskExists(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private present<
    T extends {
      dueDate: Date | null;
      status: TaskStatus;
      checklist: { completed: boolean }[];
      _count: { notes: number };
    },
  >(task: T) {
    const total = task.checklist.length;
    const completed = task.checklist.filter((item) => item.completed).length;
    return {
      ...task,
      overdue:
        task.dueDate !== null &&
        task.dueDate < new Date() &&
        task.status !== TaskStatus.DONE,
      progress: { completed, total },
      unreadMentorFeedbackCount: task._count.notes,
      _count: undefined,
    };
  }

  async createForMember(
    userId: string,
    createdById: string,
    dto: CreateTaskDto,
  ) {
    this.validateDates(dto.startDate, dto.dueDate);
    const task = await this.prisma.$transaction(async (tx) => {
      const member = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Member not found');
      return tx.task.create({
        data: {
          userId,
          createdById,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          priority: dto.priority,
          mentorPriority: dto.mentorPriority ?? false,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          checklist: dto.checklist?.length
            ? {
                create: dto.checklist.map((item, position) => ({
                  title: item.title.trim(),
                  position,
                })),
              }
            : undefined,
        },
        include: taskInclude,
      });
    });
    return this.present(task);
  }

  async findMine(userId: string, page = 1, requestedLimit = 20) {
    const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit) || 20));
    const safePage = Math.max(1, Math.floor(page) || 1);
    const where = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [
          { mentorPriority: 'desc' },
          { dueDate: 'asc' },
          { updatedAt: 'desc' },
        ],
        skip: (safePage - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      items: data.map((task) => this.present(task)),
      total,
      page: safePage,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findForMember(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        ...taskInclude,
        notes: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            taskId: true,
            authorId: true,
            type: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            readAt: true,
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.present(task);
  }

  async findForAdmin(userId: string, page = 1, requestedLimit = 20) {
    const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit) || 20));
    const safePage = Math.max(1, Math.floor(page) || 1);
    const where = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: [
          { mentorPriority: 'desc' },
          { dueDate: 'asc' },
          { updatedAt: 'desc' },
        ],
        skip: (safePage - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      items: data.map((task) => this.present(task)),
      total,
      page: safePage,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneForAdmin(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        ...taskInclude,
        notes: {
          where: { type: TaskNoteType.MENTOR_FEEDBACK },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.present(task);
  }

  async updateForAdmin(taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, startDate: true, dueDate: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    this.validateDates(
      dto.startDate === undefined
        ? task.startDate?.toISOString()
        : dto.startDate,
      dto.dueDate === undefined ? task.dueDate?.toISOString() : dto.dueDate,
    );
    const status = dto.status ?? task.status;
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...dto,
        title: dto.title?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        startDate:
          dto.startDate === undefined
            ? undefined
            : dto.startDate
              ? new Date(dto.startDate)
              : null,
        dueDate:
          dto.dueDate === undefined
            ? undefined
            : dto.dueDate
              ? new Date(dto.dueDate)
              : null,
        completedAt:
          status === TaskStatus.DONE
            ? task.status === TaskStatus.DONE
              ? undefined
              : new Date()
            : task.status === TaskStatus.DONE
              ? null
              : undefined,
      },
      include: taskInclude,
    });
    return this.present(updated);
  }

  async updateStatus(userId: string, taskId: string, status: TaskStatus) {
    await this.assertTaskForUser(taskId, userId);
    const current = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true },
    });
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt:
          status === TaskStatus.DONE
            ? current.status === TaskStatus.DONE
              ? undefined
              : new Date()
            : current.status === TaskStatus.DONE
              ? null
              : undefined,
      },
      include: taskInclude,
    });
    return this.present(updated);
  }

  async deleteForAdmin(taskId: string) {
    const result = await this.prisma.task.deleteMany({ where: { id: taskId } });
    if (!result.count) throw new NotFoundException('Task not found');
    return { success: true };
  }

  async addChecklistItem(
    userId: string,
    taskId: string,
    dto: CreateChecklistDto,
  ) {
    await this.assertTaskForUser(taskId, userId);
    return this.createChecklistItem(taskId, dto);
  }

  async addChecklistItemForAdmin(taskId: string, dto: CreateChecklistDto) {
    await this.assertTaskExists(taskId);
    return this.createChecklistItem(taskId, dto);
  }

  private async createChecklistItem(taskId: string, dto: CreateChecklistDto) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.taskChecklistItem.count({ where: { taskId } });
      const position =
        dto.position === undefined ? count : Math.min(dto.position, count);
      await tx.taskChecklistItem.updateMany({
        where: { taskId, position: { gte: position } },
        data: { position: { increment: 1 } },
      });
      return tx.taskChecklistItem.create({
        data: { taskId, title: dto.title.trim(), position },
      });
    });
  }

  async updateChecklistItem(
    userId: string,
    taskId: string,
    itemId: string,
    dto: UpdateChecklistDto,
  ) {
    await this.assertTaskForUser(taskId, userId);
    return this.editChecklistItem(taskId, itemId, dto);
  }

  async updateChecklistItemForAdmin(
    taskId: string,
    itemId: string,
    dto: UpdateChecklistDefinitionDto,
  ) {
    await this.assertTaskExists(taskId);
    return this.editChecklistItem(taskId, itemId, dto);
  }

  private async editChecklistItem(
    taskId: string,
    itemId: string,
    dto: UpdateChecklistDto,
  ) {
    const current = await this.prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId },
    });
    if (!current) throw new NotFoundException('Checklist item not found');
    return this.prisma.$transaction(async (tx) => {
      if (dto.position !== undefined && dto.position !== current.position) {
        const count = await tx.taskChecklistItem.count({ where: { taskId } });
        const target = Math.min(dto.position, Math.max(0, count - 1));
        if (target < current.position) {
          await tx.taskChecklistItem.updateMany({
            where: { taskId, position: { gte: target, lt: current.position } },
            data: { position: { increment: 1 } },
          });
        } else {
          await tx.taskChecklistItem.updateMany({
            where: { taskId, position: { gt: current.position, lte: target } },
            data: { position: { decrement: 1 } },
          });
        }
        dto.position = target;
      }
      return tx.taskChecklistItem.update({
        where: { id: itemId },
        data: { ...dto, title: dto.title?.trim() },
      });
    });
  }

  async deleteChecklistItem(userId: string, taskId: string, itemId: string) {
    await this.assertTaskForUser(taskId, userId);
    return this.removeChecklistItem(taskId, itemId);
  }

  async deleteChecklistItemForAdmin(taskId: string, itemId: string) {
    await this.assertTaskExists(taskId);
    return this.removeChecklistItem(taskId, itemId);
  }

  private async removeChecklistItem(taskId: string, itemId: string) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.taskChecklistItem.findFirst({
        where: { id: itemId, taskId },
      });
      if (!item) throw new NotFoundException('Checklist item not found');
      await tx.taskChecklistItem.delete({ where: { id: itemId } });
      await tx.taskChecklistItem.updateMany({
        where: { taskId, position: { gt: item.position } },
        data: { position: { decrement: 1 } },
      });
      return { success: true };
    });
  }

  async addPersonalNote(userId: string, taskId: string, dto: CreateNoteDto) {
    await this.assertTaskForUser(taskId, userId);
    return this.prisma.taskNote.create({
      data: {
        taskId,
        authorId: userId,
        type: TaskNoteType.PERSONAL_NOTE,
        content: dto.content.trim(),
      },
    });
  }

  async addMentorFeedback(
    authorId: string,
    taskId: string,
    dto: CreateNoteDto,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.taskNote.create({
      data: {
        taskId,
        authorId,
        type: TaskNoteType.MENTOR_FEEDBACK,
        content: dto.content.trim(),
      },
    });
  }

  async listNotes(userId: string, taskId: string) {
    await this.assertTaskForUser(taskId, userId);
    return this.prisma.taskNote.findMany({
      where: {
        taskId,
        OR: [
          { type: TaskNoteType.MENTOR_FEEDBACK },
          { type: TaskNoteType.PERSONAL_NOTE, authorId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        taskId: true,
        authorId: true,
        type: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        readAt: true,
      },
    });
  }

  async listNotesForAdmin(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.taskNote.findMany({
      where: { taskId, type: TaskNoteType.MENTOR_FEEDBACK },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markFeedbackRead(userId: string, taskId: string, noteId: string) {
    await this.assertTaskForUser(taskId, userId);
    const result = await this.prisma.taskNote.updateMany({
      where: {
        id: noteId,
        taskId,
        type: TaskNoteType.MENTOR_FEEDBACK,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      const existing = await this.prisma.taskNote.findFirst({
        where: { id: noteId, taskId, type: TaskNoteType.MENTOR_FEEDBACK },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Mentor feedback not found');
    }
    return { success: true };
  }

  async getDashboardSummary(userId: string) {
    const [counts, recentTasks, unreadMentorFeedbackCount] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { userId, status: { not: TaskStatus.DONE } },
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: { userId },
        include: taskInclude,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.taskNote.count({
        where: {
          type: TaskNoteType.MENTOR_FEEDBACK,
          readAt: null,
          task: { userId },
        },
      }),
    ]);
    const statusCounts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0 };
    for (const entry of counts)
      statusCounts[entry.status as keyof typeof statusCounts] =
        entry._count._all;
    const activeWhere = { userId, status: { not: TaskStatus.DONE } as const };
    const [
      activeTasks,
      overdueCount,
      mentorPriorityActiveCount,
      upcomingDeadlines,
    ] = await Promise.all([
      this.prisma.task.count({ where: activeWhere }),
      this.prisma.task.count({
        where: { ...activeWhere, dueDate: { lt: new Date() } },
      }),
      this.prisma.task.count({
        where: { ...activeWhere, mentorPriority: true },
      }),
      this.prisma.task.findMany({
        where: { ...activeWhere, dueDate: { gte: new Date() } },
        include: taskInclude,
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);
    return {
      totalActiveTasks: activeTasks,
      ...statusCounts,
      overdueCount,
      mentorPriorityActiveCount,
      unreadMentorFeedbackCount,
      recentTasks: recentTasks.map((task) => this.present(task)),
      upcomingDeadlines: upcomingDeadlines.map((task) => this.present(task)),
    };
  }

  private validateDates(start?: string | null, due?: string | null) {
    if (start && due && new Date(start).getTime() > new Date(due).getTime())
      throw new BadRequestException('startDate must be before dueDate');
  }
}
