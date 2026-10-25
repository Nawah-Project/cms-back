import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Application as DbApplication,
  ApplicationOutcome as DbApplicationOutcome,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { ApplicationStage } from './enums/application-stage.enum';
import { ApplicationOutcome } from './enums/application-outcome.enum';

export interface DashboardStats {
  active: {
    total: number;
    applied: number;
    assignment: number;
    interview: number;
    decision: number;
  };
  closed: {
    total: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
    noResponse: number;
  };
  expiringSoonCount: number;
  recentNoResponseCount: number;
  recentApplications: Array<
    Pick<
      DbApplication,
      | 'id'
      | 'companyName'
      | 'jobTitle'
      | 'stage'
      | 'outcome'
      | 'applicationDate'
      | 'updatedAt'
    >
  >;
}

export interface PaginatedApplications {
  data: DbApplication[];
  total: number;
  unfilteredTotal: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private formatDate(dateStr?: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  }

  private validateStageAndOutcome(
    stage: ApplicationStage,
    outcome: ApplicationOutcome,
  ): void {
    if (stage === ApplicationStage.CLOSED) {
      if (
        ![
          ApplicationOutcome.ACCEPTED,
          ApplicationOutcome.REJECTED,
          ApplicationOutcome.WITHDRAWN,
          ApplicationOutcome.NO_RESPONSE,
        ].includes(outcome)
      ) {
        throw new BadRequestException(
          'An application with stage CLOSED must have a valid closing outcome',
        );
      }
    } else if (outcome !== ApplicationOutcome.NONE) {
      throw new BadRequestException(
        `Outcome must be NONE when application stage is ${stage}`,
      );
    }
  }

  async create(
    userId: string,
    createDto: CreateApplicationDto,
  ): Promise<DbApplication> {
    const stage = createDto.stage || ApplicationStage.APPLIED;
    const outcome = createDto.outcome || ApplicationOutcome.NONE;
    if (outcome === ApplicationOutcome.NO_RESPONSE) {
      throw new BadRequestException(
        'NO_RESPONSE is assigned automatically after seven days without a response',
      );
    }
    this.validateStageAndOutcome(stage, outcome);

    const journeyState = this.prisma?.userJourneyState?.findUnique
      ? await this.prisma.userJourneyState.findUnique({
          where: { userId },
          select: { currentWeek: true },
        })
      : null;
    const journeyWeek =
      createDto.journeyWeek ?? journeyState?.currentWeek ?? 1;
    const hasAssignment =
      createDto.hasAssignment !== undefined
        ? createDto.hasAssignment
        : stage === ApplicationStage.ASSIGNMENT;

    const created = await this.prisma.application.create({
      data: {
        userId,
        companyName: createDto.companyName.trim(),
        jobTitle: createDto.jobTitle.trim(),
        applicationDate: this.formatDate(createDto.applicationDate),
        location: createDto.location?.trim() || null,
        applicationMethod: createDto.applicationMethod,
        jobUrl: createDto.jobUrl?.trim() || null,
        stage,
        outcome,
        isTailored: createDto.isTailored ?? false,
        journeyWeek,
        hasAssignment,
        interviewDate: createDto.interviewDate
          ? new Date(createDto.interviewDate)
          : null,
        ...(createDto.prepChecklist !== undefined
          ? { prepChecklist: createDto.prepChecklist as Prisma.InputJsonValue }
          : {}),
        interviewNotes: createDto.interviewNotes?.trim() || null,
        sharedWithGroup: createDto.sharedWithGroup ?? false,
        closedAt: stage === ApplicationStage.CLOSED ? new Date() : null,
      },
    });

    await this.eventEmitter?.emitAsync('application.created', {
      userId,
      applicationId: created.id,
      companyName: created.companyName,
      jobTitle: created.jobTitle,
      stage: created.stage,
      outcome: created.outcome,
      isTailored: created.isTailored,
      journeyWeek: created.journeyWeek,
      hasAssignment: created.hasAssignment,
      sharedWithGroup: created.sharedWithGroup,
    });

    return created;
  }

  async findAll(
    userId: string,
    query: ApplicationQueryDto,
  ): Promise<PaginatedApplications> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 1000) : 20;
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const search = query.search?.trim();
    const where: Prisma.ApplicationWhereInput = {
      userId,
      ...(query.stage
        ? query.stage === 'ACTIVE'
          ? { stage: { not: ApplicationStage.CLOSED } }
          : { stage: query.stage }
        : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(search
        ? {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { jobTitle: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total, unfilteredTotal] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: [{ applicationDate: sortOrder }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.application.count({ where }),
      this.prisma.application.count({ where: { userId } }),
    ]);
    return {
      data,
      total,
      unfilteredTotal,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string): Promise<DbApplication> {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!application)
      throw new NotFoundException(`Application with ID "${id}" not found`);
    return application;
  }

  async update(
    userId: string,
    id: string,
    updateDto: UpdateApplicationDto,
  ): Promise<DbApplication> {
    let transition: { userId: string; applicationId: string; fromStage: string; toStage: string; outcome: string | null } | undefined;
    let changed = false;
    const result = await this.prisma.$transaction(async (transaction) => {
      const application = await transaction.application.findFirst({
        where: { id, userId },
      });
      if (!application)
        throw new NotFoundException(`Application with ID "${id}" not found`);
      if (
        updateDto.outcome === ApplicationOutcome.NO_RESPONSE &&
        (application.outcome as unknown as ApplicationOutcome) !==
          ApplicationOutcome.NO_RESPONSE
      ) {
        throw new BadRequestException(
          'NO_RESPONSE is assigned automatically after seven days without a response',
        );
      }
      const previousStage = application.stage;
      const nextStage = (updateDto.stage ??
        application.stage) as ApplicationStage;
      let nextOutcome = (updateDto.outcome ??
        application.outcome) as ApplicationOutcome;
      if (
        application.stage === 'CLOSED' &&
        nextStage !== ApplicationStage.CLOSED
      ) {
        nextOutcome = ApplicationOutcome.NONE;
      }
      if (
        application.stage !== 'CLOSED' &&
        nextStage === ApplicationStage.CLOSED &&
        (updateDto.outcome === undefined ||
          nextOutcome === ApplicationOutcome.NONE)
      ) {
        throw new BadRequestException(
          'Changing stage to CLOSED requires an outcome (ACCEPTED, REJECTED, or WITHDRAWN)',
        );
      }
      this.validateStageAndOutcome(nextStage, nextOutcome);
      const data: Prisma.ApplicationUpdateInput = {};
      if (updateDto.companyName !== undefined) {
        const companyName = updateDto.companyName.trim();
        if (companyName !== application.companyName)
          data.companyName = companyName;
      }
      if (updateDto.jobTitle !== undefined) {
        const jobTitle = updateDto.jobTitle.trim();
        if (jobTitle !== application.jobTitle) data.jobTitle = jobTitle;
      }
      if (updateDto.applicationDate !== undefined) {
        const applicationDate = this.formatDate(updateDto.applicationDate);
        if (applicationDate !== application.applicationDate)
          data.applicationDate = applicationDate;
      }
      if (updateDto.location !== undefined) {
        const location = updateDto.location?.trim() || null;
        if (location !== application.location) data.location = location;
      }
      if (
        updateDto.applicationMethod !== undefined &&
        updateDto.applicationMethod !== application.applicationMethod
      ) {
        data.applicationMethod = updateDto.applicationMethod;
      }
      if (updateDto.jobUrl !== undefined) {
        const jobUrl = updateDto.jobUrl?.trim() || null;
        if (jobUrl !== application.jobUrl) data.jobUrl = jobUrl;
      }
      if (
        (nextStage as unknown as DbApplication['stage']) !== application.stage
      )
        data.stage = nextStage;
      if (
        (nextOutcome as unknown as DbApplication['outcome']) !==
        application.outcome
      )
        data.outcome = nextOutcome;
      if (
        (nextStage as unknown as DbApplication['stage']) !== application.stage
      ) {
        data.closedAt =
          nextStage === ApplicationStage.CLOSED ? new Date() : null;
      }
      if (
        updateDto.isTailored !== undefined &&
        updateDto.isTailored !== application.isTailored
      ) {
        data.isTailored = updateDto.isTailored;
      }
      if (
        updateDto.hasAssignment !== undefined &&
        updateDto.hasAssignment !== application.hasAssignment
      ) {
        data.hasAssignment = updateDto.hasAssignment;
      } else if (
        nextStage === ApplicationStage.ASSIGNMENT &&
        !application.hasAssignment
      ) {
        data.hasAssignment = true;
      }
      if (updateDto.interviewDate !== undefined) {
        const nextInterviewDate = updateDto.interviewDate
          ? new Date(updateDto.interviewDate)
          : null;
        const prevInterviewTime = application.interviewDate?.getTime() ?? null;
        const nextInterviewTime = nextInterviewDate?.getTime() ?? null;
        if (prevInterviewTime !== nextInterviewTime) {
          data.interviewDate = nextInterviewDate;
        }
      }
      if (updateDto.prepChecklist !== undefined) {
        data.prepChecklist =
          updateDto.prepChecklist === null
            ? Prisma.DbNull
            : (updateDto.prepChecklist as Prisma.InputJsonValue);
      }
      if (updateDto.interviewNotes !== undefined) {
        const interviewNotes = updateDto.interviewNotes?.trim() || null;
        if (interviewNotes !== application.interviewNotes) {
          data.interviewNotes = interviewNotes;
        }
      }
      if (
        updateDto.sharedWithGroup !== undefined &&
        updateDto.sharedWithGroup !== application.sharedWithGroup
      ) {
        data.sharedWithGroup = updateDto.sharedWithGroup;
      }
      if (Object.keys(data).length === 0) return application;
      changed = true;
      const updated = await transaction.application.update({
        where: { id },
        data,
      });
      const stageChanged = previousStage.toString() !== nextStage.toString();
      if (stageChanged) {
        await transaction.applicationStageTransition.create({
          data: {
            applicationId: application.id,
            userId,
            fromStage: previousStage,
            toStage: nextStage,
            outcome:
              nextStage === ApplicationStage.CLOSED
                ? (nextOutcome as DbApplicationOutcome)
                : null,
          },
        });
        transition = { userId, applicationId: updated.id, fromStage: previousStage,
          toStage: nextStage, outcome: nextStage === ApplicationStage.CLOSED ? nextOutcome : null };
      }

      return updated;
    });
    if (!changed) return result;
    await this.eventEmitter?.emitAsync('application.updated', {
      userId, applicationId: result.id, companyName: result.companyName,
      jobTitle: result.jobTitle, stage: result.stage, outcome: result.outcome,
      hasAssignment: result.hasAssignment, isTailored: result.isTailored,
      sharedWithGroup: result.sharedWithGroup,
    });
    if (transition) await this.eventEmitter?.emitAsync('application.stage_changed', transition);
    return result;
  }

  async remove(
    userId: string,
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.findOne(userId, id);
    await this.prisma.application.delete({ where: { id } });
    return {
      success: true,
      message: `Application with ID "${id}" successfully deleted`,
    };
  }

  async getDashboard(userId: string): Promise<DashboardStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const [
      groups,
      recentApplications,
      expiringSoonCount,
      recentNoResponseCount,
    ] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['stage', 'outcome'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.application.findMany({
        where: { userId },
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          stage: true,
          outcome: true,
          applicationDate: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 4,
      }),
      this.prisma.application.count({
        where: {
          userId,
          stage: { not: ApplicationStage.CLOSED },
          updatedAt: {
            gte: sevenDaysAgo,
            lte: fourDaysAgo,
          },
        },
      }),
      this.prisma.application.count({
        where: {
          userId,
          stage: ApplicationStage.CLOSED,
          outcome: ApplicationOutcome.NO_RESPONSE,
          closedAt: { gte: sevenDaysAgo },
        },
      }),
    ]);
    let applied = 0,
      assignment = 0,
      interview = 0,
      decision = 0;
    let accepted = 0,
      rejected = 0,
      withdrawn = 0,
      noResponse = 0;
    for (const row of groups) {
      const count = row._count._all;
      if (row.stage === 'APPLIED') applied += count;
      else if (row.stage === 'ASSIGNMENT') assignment += count;
      else if (row.stage === 'INTERVIEW') interview += count;
      else if (row.stage === 'DECISION') decision += count;
      else if (row.stage === 'CLOSED') {
        if (row.outcome === 'ACCEPTED') accepted += count;
        else if (row.outcome === 'REJECTED') rejected += count;
        else if (row.outcome === 'WITHDRAWN') withdrawn += count;
        else if (row.outcome === 'NO_RESPONSE') noResponse += count;
      }
    }
    return {
      active: {
        total: applied + assignment + interview + decision,
        applied,
        assignment,
        interview,
        decision,
      },
      closed: {
        total: accepted + rejected + withdrawn + noResponse,
        accepted,
        rejected,
        withdrawn,
        noResponse,
      },
      expiringSoonCount,
      recentNoResponseCount,
      recentApplications,
    };
  }
}
