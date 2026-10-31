import { PrismaService } from '../prisma/prisma.service';
import { JourneyEngineService } from './journey-engine.service';
import {
  JOURNEY_V4_NODES,
  JourneyNodeSeedItem,
  seedJourneyV4Nodes,
} from './journey-v4.seed';

describe('Phase 1 journey initialization', () => {
  it('starts a legacy account at Task 0 while retaining its latest historical CV version', async () => {
    const prisma = {
      userJourneyState: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({data}) => data) },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
      application: { count: jest.fn().mockResolvedValue(12) },
      userCvHistory: { findFirst: jest.fn().mockResolvedValue({ versionNumber: 4 }) },
    };
    const state = await new JourneyEngineService(prisma as unknown as PrismaService).getOrCreateUserState('legacy');
    expect(state.currentNodeCode).toBe('TASK_0');
    expect(state.completedNodeCodes).toEqual([]);
    expect(state.cvVersionNumber).toBe(4);
    expect(prisma.application.count).toHaveBeenCalledWith({where:{userId:'legacy'}});
  });
  function fixture() {
    const nodes = new Map<string, JourneyNodeSeedItem>();
    const submissions = [
      { reviewSummary: 'صلحت غلط في السيرة الذاتية' },
      { postTopic: 'إزاي تتجنب اسبام LinkedIn' },
      { reviewSummary: 'Fixed an error without sending spam' },
    ];
    const state = { cvVersionNumber: 9, completedNodeCodes: ['TASK_0'] };
    const history = [{ versionNumber: 4 }, { versionNumber: 9 }];
    const prisma = {
      journeyNode: {
        upsert: jest.fn(
          async (args: {
            where: { code: string };
            update: Partial<JourneyNodeSeedItem>;
            create: JourneyNodeSeedItem;
          }) => {
            const existing = nodes.get(args.where.code);
            const node = existing
              ? { ...existing, ...args.update }
              : { ...args.create };
            nodes.set(node.code, node);
            return node;
          },
        ),
        findMany: jest.fn(async () =>
          [...nodes.values()].sort((a, b) => a.orderIndex - b.orderIndex),
        ),
      },
      sideTaskSubmission: {
        deleteMany: jest.fn(async () => {
          submissions.splice(0);
        }),
      },
      userJourneyState: {
        findMany: jest.fn(async () => [{ userId: 'synthetic', ...state }]),
        update: jest.fn(async () => {
          state.cvVersionNumber = history.length;
        }),
      },
      userCvHistory: { count: jest.fn(async () => history.length) },
      notification: {},
      $queryRawUnsafe: jest.fn(async () => []),
    };
    const service = new JourneyEngineService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma, nodes, submissions, state, history };
  }

  it('preserves reflections, posts and historical CV versions across repeated startup', async () => {
    const f = fixture();
    const before = JSON.stringify([f.submissions, f.state, f.history]);

    await f.service.onModuleInit();
    await f.service.onModuleInit();

    expect(JSON.stringify([f.submissions, f.state, f.history])).toBe(before);
    expect(f.prisma.sideTaskSubmission.deleteMany).not.toHaveBeenCalled();
    expect(f.prisma.userJourneyState.update).not.toHaveBeenCalled();
    expect(f.prisma.userCvHistory.count).not.toHaveBeenCalled();
    expect(f.nodes.size).toBe(JOURNEY_V4_NODES.length);
  });

  it('creates missing nodes without resetting any existing administrator fields', async () => {
    const f = fixture();
    await seedJourneyV4Nodes(f.prisma as unknown as PrismaService);
    const edited = {
      ...f.nodes.get('W1_M1')!,
      titleAr: 'عنوان إداري مخصص',
      descriptionEn: 'Administrator description',
      requiredAppsCount: 11,
      durationDays: 2,
      unlocksInsightCode: 'ADMIN_GUIDANCE',
    };
    f.nodes.set(edited.code, edited);
    f.nodes.delete('W4_M5');

    await f.service.onModuleInit();
    await f.service.onModuleInit();

    expect(f.nodes.get('W1_M1')).toEqual(edited);
    expect(f.nodes.get('W4_M5')).toEqual(
      JOURNEY_V4_NODES.find((node) => node.code === 'W4_M5'),
    );
    expect(f.nodes.size).toBe(JOURNEY_V4_NODES.length);
  });

  it('does not seed or write configuration on an administrator read', async () => {
    const f = fixture();
    await f.service.onModuleInit();
    f.nodes.set('W1_M1', {
      ...f.nodes.get('W1_M1')!,
      requiredAppsCount: 11,
    });
    f.prisma.journeyNode.upsert.mockClear();

    const result = await f.service.getAdminJourneyNodes();

    expect(
      result.find((node) => node.code === 'W1_M1')?.requiredAppsCount,
    ).toBe(11);
    expect(f.prisma.journeyNode.upsert).not.toHaveBeenCalled();
  });

  it('retains the complete seed dependency chain without cycles or dangling codes', () => {
    const nodes = new Map(JOURNEY_V4_NODES.map((node) => [node.code, node]));
    const visited = new Set<string>();
    let code: string | null = 'TASK_0';
    while (code !== null) {
      expect(visited.has(code)).toBe(false);
      const node = nodes.get(code);
      expect(node).toBeDefined();
      if (!node || visited.has(code)) break;
      visited.add(code);
      code = node.nextNodeCode;
    }
    expect(visited.size).toBe(25);
    expect(visited.size).toBe(nodes.size);
  });
});
