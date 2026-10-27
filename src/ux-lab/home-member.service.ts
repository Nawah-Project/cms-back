import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyEngineService } from '../journey-engine/journey-engine.service';
import { ProfileService } from '../profile/profile.service';
import { UxLabService } from './ux-lab.service';
import { makeHomePreview, PeerScope } from './home-preview.model';
import { RESEARCH_QA_ID, specialtyKey } from '../members/organized-entry';

@Injectable()
export class HomeMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journey: JourneyEngineService,
    private readonly lab: UxLabService,
    private readonly profiles: ProfileService,
  ) {}
  async context(id: string) {
    const assignment = await this.lab.assignment(id);
    if (assignment.excluded || assignment.sections.home.version !== 'B')
      throw new ForbiddenException('Home B is not assigned');
    const viewer = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        name: true,
        targetJobTitle: true,
        membership: { select: { groupId: true } },
      },
    });
    const journey = await this.journey.getJourneyStateSummary(id);
    const groupUnlocked = journey.state.completedNodeCodes.includes('TASK_0');
    const outsideUnlocked =
      journey.state.completedNodeCodes.includes('W2_REVIEW');
    return { viewer, journey, groupUnlocked, outsideUnlocked };
  }
  async people(id: string, groupId?: string) {
    return (
      await this.prisma.user.findMany({
        where: { role: 'USER', id: { notIn: [id, RESEARCH_QA_ID] } },
        select: {
          id: true,
          name: true,
          targetJobTitle: true,
          portfolioUrl: true,
          cv: { select: { id: true } },
          membership: { select: { groupId: true } },
          journeyState: { select: { currentNodeCode: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((p) => ({
      id: p.id,
      nameAr: p.name,
      nameEn: p.name,
      specialization: p.targetJobTitle ?? '',
      inGroup: !!groupId && p.membership?.groupId === groupId,
      currentCode: p.journeyState?.currentNodeCode ?? 'TASK_0',
      hasCv: !!p.cv,
      hasPortfolio: !!p.portfolioUrl,
      portfolioUrl: p.portfolioUrl,
    }));
  }
  async home(id: string) {
    const { viewer, journey, groupUnlocked, outsideUnlocked } =
      await this.context(id);
    const people = await this.people(id, viewer.membership?.groupId);
    // Reuse topology/branch construction only. Every viewer/progress/count value
    // below comes from durable journey state, never the preview's sample people.
    const home = makeHomePreview('FINISHED', journey.nodes);
    const current = journey.currentNode;
    home.currentCode = journey.state.currentNodeCode;
    const weeks = home.weeks.map((w) => ({
      ...w,
      titleAr:
        w.week > journey.state.currentWeek
          ? 'تفاصيلها تظهر في وقتها'
          : w.titleAr,
      titleEn:
        w.week > journey.state.currentWeek
          ? 'Details unfold when you reach them'
          : w.titleEn,
      nodes: w.nodes.map((n) => {
        const actual = journey.nodes.find((x) => x.code === n.code)!;
        const locked = actual.status === 'LOCKED_BLURRED';
        const completed = actual.status === 'COMPLETED';
        const metrics = actual.progress;
        const req = n.requirements.map((r) => {
          const value =
            r.key === 'review'
              ? metrics.weeklyReview
              : metrics[r.key as 'apps' | 'tailored' | 'posts' | 'outreach'];
          return {
            ...r,
            current: completed ? r.required : (value?.current ?? 0),
          };
        });
        return {
          ...n,
          status: locked ? 'LOCKED' : actual.status,
          titleAr: locked ? null : n.titleAr,
          titleEn: locked ? null : n.titleEn,
          descriptionAr: locked ? null : n.descriptionAr,
          descriptionEn: locked ? null : n.descriptionEn,
          durationDays: locked ? null : n.durationDays,
          requirements: locked ? [] : req,
          branches: n.branches.map((b, index) => {
            const guidance = b.kind === 'GUIDANCE';
            const open = guidance
              ? journey.state.unlockedInsightCodes.includes(b.id)
              : !locked;
            const metric = req.find((r) => r.key.toUpperCase() === b.kind);
            return {
              ...b,
              id: open ? b.id : `${n.code}-locked-${index}`,
              kind: open ? b.kind : 'LOCKED',
              titleAr: open ? b.titleAr : null,
              titleEn: open ? b.titleEn : null,
              value: open ? b.value : null,
              locked: !open,
              done:
                open &&
                (guidance
                  ? journey.state.readInsightCodes.includes(b.id)
                  : completed ||
                    (!!metric && metric.current >= metric.required)),
            };
          }),
          counts: {
            group: groupUnlocked
              ? people.filter((p) => p.inGroup && p.currentCode === n.code)
                  .length
              : null,
            specialty: people.filter(
              (p) =>
                p.currentCode === n.code &&
                specialtyKey(p.specialization) ===
                  specialtyKey(viewer.targetJobTitle),
            ).length,
            all: people.filter((p) => p.currentCode === n.code).length,
          },
        };
      }),
    }));
    const cvPending =
      journey.cvFoundation.unlocked && !journey.cvFoundation.completed;
    const complete = journey.state.completedNodeCodes.includes('FINAL_REPORT');
    const nextAt =
      current?.durationDays && current.nextNodeCode
        ? new Date(
            new Date(journey.state.currentNodeStartedAt).getTime() +
              current.durationDays * 86400000,
          )
        : null;
    const waiting =
      !!current &&
      current.progress.overallPercentage >= 100 &&
      !!nextAt &&
      nextAt > new Date();
    return {
      ...home,
      preview: false,
      scenario: null,
      weeks,
      viewer: {
        nameAr: viewer.name,
        nameEn: viewer.name,
        specialization: viewer.targetJobTitle ?? '',
        groupUnlocked,
        outsideUnlocked,
        completedCount: journey.state.completedNodeCodes.length,
        totalNodes: journey.nodes.length,
      },
      nextAction: {
        kind: cvPending
          ? 'CV'
          : complete
            ? 'REPORT'
            : waiting
              ? 'WAIT'
              : current?.nodeType === 'REVIEW_STATION'
                ? 'REVIEW'
                : 'APPLICATION',
        stationCode: home.currentCode,
        titleAr: cvPending
          ? 'طبّق إرشاد السيرة وارفع النسخة المعدّلة'
          : waiting
            ? 'أنجزت المطلوب. المحطة التالية تفتح في موعدها.'
            : complete
              ? 'راجع حصاد رحلتك'
              : 'كمّل من محطتك الحالية',
        titleEn: cvPending
          ? 'Apply the CV guidance and upload your revision'
          : waiting
            ? 'Work complete. Your next station opens on schedule.'
            : complete
              ? 'Review your journey'
              : 'Continue your current station',
        detailAr: cvPending
          ? 'إرشاد تأسيس السيرة في التطور المهني. بعد التطبيق ارفع نسخة جديدة وأكد إتمامه.'
          : 'افتح قائمة المهام لمراجعة المتطلبات الفعلية والخطوة المناسبة.',
        detailEn: cvPending
          ? 'Open the CV foundation guidance in Development, apply it, upload a new CV and confirm completion.'
          : 'Open your task list to see the actual requirements and next action.',
        availableAt: waiting ? nextAt!.toISOString() : null,
      },
    };
  }
  async peers(
    id: string,
    code: string,
    scope: PeerScope,
    page: number,
    includeGroup: boolean,
  ) {
    const c = await this.context(id);
    if (!c.journey.nodes.some((n) => n.code === code))
      throw new NotFoundException();
    const people = (await this.people(id, c.viewer.membership?.groupId)).filter(
      (p) => p.currentCode === code,
    );
    const matching = people.filter(
      (p) =>
        (scope === 'GROUP' && p.inGroup) ||
        (scope !== 'GROUP' &&
          (scope === 'ALL' ||
            specialtyKey(p.specialization) ===
              specialtyKey(c.viewer.targetJobTitle))) ||
        (includeGroup && p.inGroup),
    );
    const allowed = matching.filter((p) =>
      p.inGroup ? c.groupUnlocked : c.outsideUnlocked,
    );
    return {
      items: allowed
        .slice((page - 1) * 20, page * 20)
        .map(({ portfolioUrl, ...p }) => p),
      total: allowed.length,
      page,
      pageSize: 20,
      lockedGroupCount: matching.filter((p) => p.inGroup && !c.groupUnlocked)
        .length,
      lockedOutsideCount: matching.filter(
        (p) => !p.inGroup && !c.outsideUnlocked,
      ).length,
    };
  }
  async peer(id: string, targetId: string) {
    const c = await this.context(id);
    const peer = (await this.people(id, c.viewer.membership?.groupId)).find(
      (p) => p.id === targetId,
    );
    if (!peer) throw new NotFoundException();
    if (!(peer.inGroup ? c.groupUnlocked : c.outsideUnlocked))
      throw new ForbiddenException(
        'Complete the required journey milestone first',
      );
    return peer;
  }
  async cv(id: string, targetId: string) {
    await this.peer(id, targetId);
    // Authorization above is specific to B, checks both current cohort and journey.
    // Read the same current file path as the owner; never expose CV history here.
    return this.profiles.getCvForUser(targetId, targetId);
  }
}
