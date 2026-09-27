import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.application.create({
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
        closedAt: stage === ApplicationStage.CLOSED ? new Date() : null,
      },
    });
  }

  async findAll(
    userId: string,
    query: ApplicationQueryDto,
  ): Promise<PaginatedApplications> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const search = query.search?.trim();
    const where: Prisma.ApplicationWhereInput = {
      userId,
      ...(query.stage ? { stage: query.stage } : {}),
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
    const [data, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: [{ applicationDate: sortOrder }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.application.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
    if (updateDto.outcome === ApplicationOutcome.NO_RESPONSE) {
      throw new BadRequestException(
        'NO_RESPONSE is assigned automatically after seven days without a response',
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.application.findFirst({
        where: { id, userId },
      });
      if (!application)
        throw new NotFoundException(`Application with ID "${id}" not found`);
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
      if (nextStage !== application.stage) data.stage = nextStage;
      if (nextOutcome !== application.outcome) data.outcome = nextOutcome;
      if (nextStage !== application.stage) {
        data.closedAt =
          nextStage === ApplicationStage.CLOSED ? new Date() : null;
      }
      if (Object.keys(data).length === 0) return application;
      const updated = await transaction.application.update({
        where: { id },
        data,
      });
      if (previousStage.toString() !== nextStage.toString()) {
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
      }
      return updated;
    });
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
    const [groups, recentApplications] = await Promise.all([
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
    ]);
    let applied = 0,
      interview = 0,
      decision = 0;
    let accepted = 0,
      rejected = 0,
      withdrawn = 0,
      noResponse = 0;
    for (const row of groups) {
      const count = row._count._all;
      if (row.stage === 'APPLIED') applied += count;
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
        total: applied + interview + decision,
        applied,
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
      recentApplications,
    };
  }
}
