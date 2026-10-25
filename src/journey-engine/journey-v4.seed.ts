import { JourneyNodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface JourneyNodeSeedItem {
  code: string;
  weekNumber: number;
  orderIndex: number;
  nodeType: JourneyNodeType;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  durationDays: number;
  requiredAppsCount: number;
  requiredTailoredCount: number;
  requiredPostsCount: number;
  requiredOutreachCount: number;
  unlocksInsightCode: string | null;
  nextNodeCode: string | null;
}

export const JOURNEY_V4_NODES: readonly JourneyNodeSeedItem[] = [
  // ============================================================================
  // Week 0: Onboarding Quest (المهمة صفر)
  // ============================================================================
  {
    code: 'TASK_0',
    weekNumber: 0,
    orderIndex: 0,
    nodeType: JourneyNodeType.ONBOARDING_QUEST,
    titleAr: 'المهمة صفر: انطلاقة التقديم الفعلي',
    titleEn: 'Task 0: Kickstart Real Applications',
    descriptionAr:
      'قدم على أول 5 وظائف فعلية لكسر حاجز التردد وفتح مجموعتك وملاحظة تأسيس السيرة الذاتية.',
    descriptionEn:
      'Submit your first 5 real job applications to unlock your cohort group and base CV insight.',
    durationDays: 1,
    requiredAppsCount: 5,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_TASK_0_CV_BASE',
    nextNodeCode: 'W1_M1',
  },

  // ============================================================================
  // Week 1: Total 100 Applications (10 + 15 + 20 + 25 + 30) + Review 1
  // ============================================================================
  {
    code: 'W1_M1',
    weekNumber: 1,
    orderIndex: 1,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 1 - المهمة 1: بناء زخم التقديم',
    titleEn: 'Week 1 - Quest 1: Building Application Momentum',
    descriptionAr:
      'أضف 10 طلبات تقديم جديدة لفتح عرض الجدول المتقدم وكشف المهمة التالية.',
    descriptionEn:
      'Submit 10 job applications to unlock the advanced Table View and reveal the next quest.',
    durationDays: 1,
    requiredAppsCount: 10,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W1_M2',
  },
  {
    code: 'W1_M2',
    weekNumber: 1,
    orderIndex: 2,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 1 - المهمة 2: توسيع دائرة البحث',
    titleEn: 'Week 1 - Quest 2: Expanding Search Reach',
    descriptionAr:
      'أضف 15 طلب تقديم جديد لفتح الدليل الأساسي للتحضير للمقابلات.',
    descriptionEn:
      'Submit 15 job applications to unlock the basic interview preparation insight.',
    durationDays: 1,
    requiredAppsCount: 15,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W1_INTERVIEW_BASIC',
    nextNodeCode: 'W1_M3',
  },
  {
    code: 'W1_M3',
    weekNumber: 1,
    orderIndex: 3,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 1 - المهمة 3: الاستمرارية اليومية',
    titleEn: 'Week 1 - Quest 3: Daily Consistency',
    descriptionAr: 'أضف 20 طلب تقديم جديد للحفاظ على وتيرة التقديم العالية.',
    descriptionEn:
      'Submit 20 job applications to maintain high daily application consistency.',
    durationDays: 1,
    requiredAppsCount: 20,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W1_M4',
  },
  {
    code: 'W1_M4',
    weekNumber: 1,
    orderIndex: 4,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 1 - المهمة 4: تكثيف الفرص',
    titleEn: 'Week 1 - Quest 4: Scaling Opportunities',
    descriptionAr: 'أضف 25 طلب تقديم جديد عبر منصات التوظيف المختلفة.',
    descriptionEn:
      'Submit 25 job applications across multiple job platforms.',
    durationDays: 1,
    requiredAppsCount: 25,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W1_M5',
  },
  {
    code: 'W1_M5',
    weekNumber: 1,
    orderIndex: 5,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 1 - المهمة 5: ختام الأسبوع الأول (يومان)',
    titleEn: 'Week 1 - Quest 5: Week 1 Sprint Finale (2 Days)',
    descriptionAr:
      'أكمل 30 طلب تقديم خلال يومين للوصول إلى إجمالي 100 طلب في الأسبوع الأول.',
    descriptionEn:
      'Complete 30 job applications over 2 days to reach 100 total applications in Week 1.',
    durationDays: 2,
    requiredAppsCount: 30,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W1_REVIEW',
  },
  {
    code: 'W1_REVIEW',
    weekNumber: 1,
    orderIndex: 6,
    nodeType: JourneyNodeType.REVIEW_STATION,
    titleAr: 'محطة اليوم السابع: التقييم والتعديل رقم 1',
    titleEn: 'Day 7 Station: Review & Optimization #1',
    descriptionAr:
      'راجع معدل التحويل في الأسبوع الأول، وحدّث سيرتك الذاتية لفتح استراتيجية الطلبات الخاصة.',
    descriptionEn:
      'Review your Week 1 conversion rate and update your CV to unlock the tailored applications strategy.',
    durationDays: 1,
    requiredAppsCount: 0,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W1_TAILORED_CV',
    nextNodeCode: 'W2_M1',
  },

  // ============================================================================
  // Week 2: Total 125 Applications (25 Tailored) + Review 2
  // ============================================================================
  {
    code: 'W2_M1',
    weekNumber: 2,
    orderIndex: 7,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 2 - المهمة 1: بداية التقديم المخصص',
    titleEn: 'Week 2 - Quest 1: Starting Tailored Applications',
    descriptionAr: 'أضف 15 طلب تقديم، منها 3 طلبات خاصة مخصصة للوصف الوظيفي.',
    descriptionEn:
      'Submit 15 job applications, including 3 tailored applications.',
    durationDays: 1,
    requiredAppsCount: 15,
    requiredTailoredCount: 3,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W2_M2',
  },
  {
    code: 'W2_M2',
    weekNumber: 2,
    orderIndex: 8,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 2 - المهمة 2: رفع دقة الاستهداف',
    titleEn: 'Week 2 - Quest 2: Raising Targeting Precision',
    descriptionAr:
      'أضف 20 طلب تقديم، منها 4 طلبات خاصة، لفتح دليل التجهيز المخصص.',
    descriptionEn:
      'Submit 20 job applications, including 4 tailored applications, to unlock custom preparation insights.',
    durationDays: 1,
    requiredAppsCount: 20,
    requiredTailoredCount: 4,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W2_CUSTOM_PREP',
    nextNodeCode: 'W2_M3',
  },
  {
    code: 'W2_M3',
    weekNumber: 2,
    orderIndex: 9,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 2 - المهمة 3: التوازن بين الكم والكيف',
    titleEn: 'Week 2 - Quest 3: Balancing Volume & Quality',
    descriptionAr: 'أضف 25 طلب تقديم، منها 5 طلبات خاصة عالية الجودة.',
    descriptionEn:
      'Submit 25 job applications, including 5 high-quality tailored applications.',
    durationDays: 1,
    requiredAppsCount: 25,
    requiredTailoredCount: 5,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W2_M4',
  },
  {
    code: 'W2_M4',
    weekNumber: 2,
    orderIndex: 10,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 2 - المهمة 4: التوسع المدروس',
    titleEn: 'Week 2 - Quest 4: Strategic Expansion',
    descriptionAr: 'أضف 30 طلب تقديم، منها 6 طلبات خاصة.',
    descriptionEn:
      'Submit 30 job applications, including 6 tailored applications.',
    durationDays: 1,
    requiredAppsCount: 30,
    requiredTailoredCount: 6,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W2_M5',
  },
  {
    code: 'W2_M5',
    weekNumber: 2,
    orderIndex: 11,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 2 - المهمة 5: ختام الأسبوع الثاني (يومان)',
    titleEn: 'Week 2 - Quest 5: Week 2 Sprint Finale (2 Days)',
    descriptionAr: 'أضف 35 طلب تقديم خلال يومين، منها 7 طلبات خاصة.',
    descriptionEn:
      'Submit 35 job applications over 2 days, including 7 tailored applications.',
    durationDays: 2,
    requiredAppsCount: 35,
    requiredTailoredCount: 7,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W2_REVIEW',
  },
  {
    code: 'W2_REVIEW',
    weekNumber: 2,
    orderIndex: 12,
    nodeType: JourneyNodeType.REVIEW_STATION,
    titleAr: 'محطة اليوم السابع: التقييم والتعديل رقم 2',
    titleEn: 'Day 7 Station: Review & Optimization #2',
    descriptionAr:
      'قيّم أداء الطلبات الخاصة في الأسبوع الثاني وافتح دليل صناعة المحتوى المهني على LinkedIn.',
    descriptionEn:
      'Evaluate your Week 2 tailored applications performance and unlock the LinkedIn content building guide.',
    durationDays: 1,
    requiredAppsCount: 0,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W2_CONTENT_BUILDING',
    nextNodeCode: 'W3_M1',
  },

  // ============================================================================
  // Week 3: Total 135 Applications (26 Tailored + 10 LinkedIn Posts) + Review 3
  // ============================================================================
  {
    code: 'W3_M1',
    weekNumber: 3,
    orderIndex: 13,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 3 - المهمة 1: الظهور المهني الأول',
    titleEn: 'Week 3 - Quest 1: First Professional Visibility',
    descriptionAr:
      'أضف 15 طلب تقديم (منها 3 طلبات خاصة) وانشر منشوراً مهنياً واحداً على LinkedIn.',
    descriptionEn:
      'Submit 15 applications (3 tailored) and publish 1 LinkedIn post.',
    durationDays: 1,
    requiredAppsCount: 15,
    requiredTailoredCount: 3,
    requiredPostsCount: 1,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W3_M2',
  },
  {
    code: 'W3_M2',
    weekNumber: 3,
    orderIndex: 14,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 3 - المهمة 2: إدارة الوقت والزخم',
    titleEn: 'Week 3 - Quest 2: Time & Momentum Management',
    descriptionAr:
      'أضف 22 طلب تقديم (منها 4 طلبات خاصة) ومنشوراً واحداً لفتح دليل إدارة الوقت.',
    descriptionEn:
      'Submit 22 applications (4 tailored) and 1 LinkedIn post to unlock the time management insight.',
    durationDays: 1,
    requiredAppsCount: 22,
    requiredTailoredCount: 4,
    requiredPostsCount: 1,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W3_TIME_MGMT',
    nextNodeCode: 'W3_M3',
  },
  {
    code: 'W3_M3',
    weekNumber: 3,
    orderIndex: 15,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 3 - المهمة 3: مضاعفة الحضور الرقمي',
    titleEn: 'Week 3 - Quest 3: Doubling Digital Presence',
    descriptionAr:
      'أضف 28 طلب تقديم (منها 5 طلبات خاصة) وانشر منشورين على LinkedIn.',
    descriptionEn:
      'Submit 28 applications (5 tailored) and publish 2 LinkedIn posts.',
    durationDays: 1,
    requiredAppsCount: 28,
    requiredTailoredCount: 5,
    requiredPostsCount: 2,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W3_M4',
  },
  {
    code: 'W3_M4',
    weekNumber: 3,
    orderIndex: 16,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 3 - المهمة 4: تعزيز الهوية المهنية',
    titleEn: 'Week 3 - Quest 4: Strengthening Professional Brand',
    descriptionAr:
      'أضف 30 طلب تقديم (منها 6 طلبات خاصة) وانشر منشورين على LinkedIn.',
    descriptionEn:
      'Submit 30 applications (6 tailored) and publish 2 LinkedIn posts.',
    durationDays: 1,
    requiredAppsCount: 30,
    requiredTailoredCount: 6,
    requiredPostsCount: 2,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W3_M5',
  },
  {
    code: 'W3_M5',
    weekNumber: 3,
    orderIndex: 17,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 3 - المهمة 5: ختام الأسبوع الثالث (يومان)',
    titleEn: 'Week 3 - Quest 5: Week 3 Sprint Finale (2 Days)',
    descriptionAr:
      'أضف 40 طلب تقديم خلال يومين (منها 8 طلبات خاصة) وانشر 4 منشورات.',
    descriptionEn:
      'Submit 40 applications over 2 days (8 tailored) and publish 4 LinkedIn posts.',
    durationDays: 2,
    requiredAppsCount: 40,
    requiredTailoredCount: 8,
    requiredPostsCount: 4,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: 'W3_REVIEW',
  },
  {
    code: 'W3_REVIEW',
    weekNumber: 3,
    orderIndex: 18,
    nodeType: JourneyNodeType.REVIEW_STATION,
    titleAr: 'محطة اليوم السابع: التقييم والتعديل رقم 3',
    titleEn: 'Day 7 Station: Review & Optimization #3',
    descriptionAr:
      'راجع نتائج الأسبوع الثالث وافتح دليل بناء العلاقات والتواصل المباشر (Networking).',
    descriptionEn:
      'Review Week 3 outcomes and unlock the direct networking & outreach guide.',
    durationDays: 1,
    requiredAppsCount: 0,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: 'INSIGHT_W3_NETWORKING',
    nextNodeCode: 'W4_M1',
  },

  // ============================================================================
  // Week 4: Total 140 Applications (26 Tailored + 10 Posts + 10 Outreach) + Final Report
  // ============================================================================
  {
    code: 'W4_M1',
    weekNumber: 4,
    orderIndex: 19,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 4 - المهمة 1: تفعيل التواصل المباشر',
    titleEn: 'Week 4 - Quest 1: Activating Direct Outreach',
    descriptionAr:
      'أضف 18 طلب تقديم (3 خاصة) + منشور 1 + تواصل مباشر 1 مع مسؤولي التوظيف.',
    descriptionEn:
      'Submit 18 applications (3 tailored), 1 post, and 1 outreach contact.',
    durationDays: 1,
    requiredAppsCount: 18,
    requiredTailoredCount: 3,
    requiredPostsCount: 1,
    requiredOutreachCount: 1,
    unlocksInsightCode: null,
    nextNodeCode: 'W4_M2',
  },
  {
    code: 'W4_M2',
    weekNumber: 4,
    orderIndex: 20,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 4 - المهمة 2: التخطيط الذاتي للمسار المهني',
    titleEn: 'Week 4 - Quest 2: Self-Directed Career Planning',
    descriptionAr:
      'أضف 22 طلب تقديم (4 خاصة) + منشور 1 + تواصل 1 لفتح خطة الاستمرارية المهنية الذاتية.',
    descriptionEn:
      'Submit 22 applications (4 tailored), 1 post, and 1 outreach contact to unlock the self-career plan insight.',
    durationDays: 1,
    requiredAppsCount: 22,
    requiredTailoredCount: 4,
    requiredPostsCount: 1,
    requiredOutreachCount: 1,
    unlocksInsightCode: 'INSIGHT_W4_SELF_CAREER_PLAN',
    nextNodeCode: 'W4_M3',
  },
  {
    code: 'W4_M3',
    weekNumber: 4,
    orderIndex: 21,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 4 - المهمة 3: توسيع شبكة العلاقات',
    titleEn: 'Week 4 - Quest 3: Expanding Referral Network',
    descriptionAr:
      'أضف 28 طلب تقديم (5 خاصة) + منشورين + عمليتي تواصل مباشر.',
    descriptionEn:
      'Submit 28 applications (5 tailored), 2 posts, and 2 outreach contacts.',
    durationDays: 1,
    requiredAppsCount: 28,
    requiredTailoredCount: 5,
    requiredPostsCount: 2,
    requiredOutreachCount: 2,
    unlocksInsightCode: null,
    nextNodeCode: 'W4_M4',
  },
  {
    code: 'W4_M4',
    weekNumber: 4,
    orderIndex: 22,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 4 - المهمة 4: قوة الدفع القصوى',
    titleEn: 'Week 4 - Quest 4: Maximum Career Velocity',
    descriptionAr:
      'أضف 32 طلب تقديم (6 خاصة) + منشورين + عمليتي تواصل مباشر.',
    descriptionEn:
      'Submit 32 applications (6 tailored), 2 posts, and 2 outreach contacts.',
    durationDays: 1,
    requiredAppsCount: 32,
    requiredTailoredCount: 6,
    requiredPostsCount: 2,
    requiredOutreachCount: 2,
    unlocksInsightCode: null,
    nextNodeCode: 'W4_M5',
  },
  {
    code: 'W4_M5',
    weekNumber: 4,
    orderIndex: 23,
    nodeType: JourneyNodeType.MAIN_QUEST,
    titleAr: 'الأسبوع 4 - المهمة 5: ختام الأسبوع الرابع (يومان)',
    titleEn: 'Week 4 - Quest 5: Week 4 Sprint Finale (2 Days)',
    descriptionAr:
      'أضف 40 طلب تقديم خلال يومين (8 خاصة) + 4 منشورات + 4 عمليات تواصل مباشر.',
    descriptionEn:
      'Submit 40 applications over 2 days (8 tailored), 4 posts, and 4 outreach contacts.',
    durationDays: 2,
    requiredAppsCount: 40,
    requiredTailoredCount: 8,
    requiredPostsCount: 4,
    requiredOutreachCount: 4,
    unlocksInsightCode: null,
    nextNodeCode: 'FINAL_REPORT',
  },
  {
    code: 'FINAL_REPORT',
    weekNumber: 4,
    orderIndex: 25,
    nodeType: JourneyNodeType.FINAL_REPORT,
    titleAr: 'التقرير النهائي: حصاد الرحلة وخطة الانطلاق',
    titleEn: 'Final Report: Journey Harvest & Launch Plan',
    descriptionAr:
      'استعرض حصيلة رحلتك الكاملة عبر الأسابيع الأربعة ومعدلات التحويل والإنجاز المهني.',
    descriptionEn:
      'Review your complete 4-week journey harvest, conversion rates, and professional milestones.',
    durationDays: 1,
    requiredAppsCount: 0,
    requiredTailoredCount: 0,
    requiredPostsCount: 0,
    requiredOutreachCount: 0,
    unlocksInsightCode: null,
    nextNodeCode: null,
  },
];

export async function seedJourneyV4Nodes(
  prisma: PrismaService | Prisma.TransactionClient,
): Promise<void> {
  const client = prisma as PrismaService;
  if (!client?.journeyNode?.upsert) return;

  for (const node of JOURNEY_V4_NODES) {
    await client.journeyNode.upsert({
      where: { code: node.code },
      // Existing rows belong to administrator configuration. Reinitialization
      // only fills missing codes; changes to existing defaults need explicit maintenance.
      update: {},
      create: {
        code: node.code,
        weekNumber: node.weekNumber,
        orderIndex: node.orderIndex,
        nodeType: node.nodeType,
        titleAr: node.titleAr,
        titleEn: node.titleEn,
        descriptionAr: node.descriptionAr,
        descriptionEn: node.descriptionEn,
        durationDays: node.durationDays,
        requiredAppsCount: node.requiredAppsCount,
        requiredTailoredCount: node.requiredTailoredCount,
        requiredPostsCount: node.requiredPostsCount,
        requiredOutreachCount: node.requiredOutreachCount,
        unlocksInsightCode: node.unlocksInsightCode,
        nextNodeCode: node.nextNodeCode,
      },
    });
  }
}

