import { NotFoundException } from '@nestjs/common';
import { TaskNoteType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      taskChecklistItem: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      taskNote: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      $transaction: jest.fn(async (input: any) =>
        Array.isArray(input) ? Promise.all(input) : input(prisma),
      ),
    };
    service = new TasksService(prisma as PrismaService);
  });

  it('scopes member task queries to the authenticated member and bounds pagination', async () => {
    await service.findMine('member-1', 2, 500);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'member-1' },
        skip: 50,
        take: 50,
      }),
    );
  });

  it('prevents a member from acting on another member task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(
      service.addPersonalNote('member-1', 'other-task', { content: 'private' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskNote.create).not.toHaveBeenCalled();
  });

  it('stores a member note as PERSONAL_NOTE under the authenticated identity', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1' });
    prisma.taskNote.create.mockResolvedValue({ id: 'note-1' });
    await service.addPersonalNote('member-1', 'task-1', { content: 'My note' });
    expect(prisma.taskNote.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        authorId: 'member-1',
        type: TaskNoteType.PERSONAL_NOTE,
        content: 'My note',
      },
    });
  });

  it('returns mentor feedback and only the member own personal notes', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1' });
    await service.listNotes('member-1', 'task-1');
    expect(prisma.taskNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskId: 'task-1',
          OR: [
            { type: TaskNoteType.MENTOR_FEEDBACK },
            { type: TaskNoteType.PERSONAL_NOTE, authorId: 'member-1' },
          ],
        },
      }),
    );
  });

  it('allows reading mentor feedback only for a task owned by the member', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(
      service.markFeedbackRead('member-1', 'other-task', 'note-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskNote.updateMany).not.toHaveBeenCalled();
  });

  it('creates feedback as a mentor note and does not mark it read', async () => {
    prisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
    prisma.taskNote.create.mockResolvedValue({ id: 'feedback-1' });
    await service.addMentorFeedback('admin-1', 'task-1', {
      content: 'Please revise this section.',
    });
    expect(prisma.taskNote.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        authorId: 'admin-1',
        type: TaskNoteType.MENTOR_FEEDBACK,
        content: 'Please revise this section.',
      },
    });
  });

  it('calculates overdue status from due date and keeps completed work not overdue', async () => {
    const baseTask = {
      dueDate: new Date('2020-01-01T00:00:00Z'),
      checklist: [{ completed: true }, { completed: false }],
      notes: [],
      _count: { notes: 2 },
    };
    prisma.task.findMany
      .mockResolvedValueOnce([{ ...baseTask, status: TaskStatus.TODO }])
      .mockResolvedValueOnce([{ ...baseTask, status: TaskStatus.DONE }]);
    const overdue = await service.findMine('member-1');
    const completed = await service.findMine('member-1');
    expect(overdue.items[0]).toMatchObject({
      overdue: true,
      progress: { completed: 1, total: 2 },
      unreadMentorFeedbackCount: 2,
    });
    expect(completed.items[0].overdue).toBe(false);
  });

  it('sets completedAt only when a member marks the task DONE', async () => {
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1' });
    prisma.task.findUniqueOrThrow.mockResolvedValue({
      status: TaskStatus.IN_PROGRESS,
    });
    prisma.task.update.mockImplementation(async ({ data }: any) => ({
      ...data,
      dueDate: null,
      checklist: [],
      notes: [],
      _count: { notes: 0 },
    }));
    await service.updateStatus('member-1', 'task-1', TaskStatus.DONE);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: TaskStatus.DONE,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });
});
