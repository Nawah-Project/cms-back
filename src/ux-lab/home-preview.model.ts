import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JourneyNodeSeedItem } from "../journey-engine/journey-v4.seed";
import { JOURNEY_GUIDANCE_CATALOG } from "../feedback/journey-guidance.catalog";
export const HOME_SCENARIOS = [
  "START",
  "WEEK_ONE",
  "AFTER_WEEK_TWO",
  "FINISHED",
  "WAITING",
] as const;
export type HomeScenario = (typeof HOME_SCENARIOS)[number];
export type PeerScope = "GROUP" | "SPECIALTY" | "ALL";
const titles = [
  ["نقطة البداية", "Your starting point"],
  ["بناء زخم التقديم", "Build application momentum"],
  ["قيمة خبراتك", "The value of your experience"],
  ["حضورك المهني", "Your professional presence"],
  ["العلاقات والخطوة التالية", "Connections and your next step"],
];
const people = [
  ["ليلى حسن", "Layla Hassan", "UI/UX Designer", true, "TASK_0"],
  ["عمر سامي", "Omar Samy", "UI/UX Designer", true, "W1_M1"],
  ["نور علي", "Nour Ali", "Frontend Developer", true, "W2_M2"],
  ["سلمى أحمد", "Salma Ahmed", "UI/UX Designer", true, "W3_M2"],
  ["كريم عادل", "Karim Adel", "UI/UX Designer", true, "W4_M3"],
  ["مريم خالد", "Mariam Khaled", "UI/UX Designer", false, "TASK_0"],
  ["يوسف طارق", "Youssef Tarek", "UI/UX Designer", false, "W1_M1"],
  ["ندى محمود", "Nada Mahmoud", "UI/UX Designer", false, "W1_M1"],
  ["آدم جمال", "Adam Gamal", "Frontend Developer", false, "W1_M3"],
  ["سارة عمرو", "Sara Amr", "UI/UX Designer", false, "W2_M2"],
  ["هنا شريف", "Hana Sherif", "Backend Developer", false, "W2_M2"],
  ["زياد حسن", "Ziad Hassan", "UI/UX Designer", false, "W3_M2"],
  ["ريم سامي", "Reem Samy", "UI/UX Designer", false, "W3_M2"],
  ["مازن علي", "Mazen Ali", "UI/UX Designer", false, "W3_M4"],
  ["دينا طه", "Dina Taha", "Data Analyst", false, "W4_M3"],
  ["أحمد نور", "Ahmed Nour", "UI/UX Designer", false, "FINAL_REPORT"],
] as const;
export const DEMO_PEERS = people.map(
  ([nameAr, nameEn, specialization, inGroup, currentCode], i) => ({
    id: `demo-${String(i + 1).padStart(2, "0")}`,
    nameAr,
    nameEn,
    specialization,
    inGroup,
    currentCode,
    hasCv: i !== 13,
    hasPortfolio: i !== 8,
  }),
);
export function scenarioState(
  scenario: HomeScenario,
  nodes: readonly JourneyNodeSeedItem[],
) {
  const currentCode =
    scenario === "START"
      ? "TASK_0"
      : scenario === "WEEK_ONE"
        ? "W1_M1"
        : scenario === "WAITING"
          ? "W1_M5"
          : scenario === "AFTER_WEEK_TWO"
            ? "W3_M2"
            : "FINAL_REPORT";
  const current = nodes.find((n) => n.code === currentCode);
  if (!current)
    throw new NotFoundException("This preview station is not configured");
  const completed = nodes
    .filter((n) => n.orderIndex < current.orderIndex || scenario === "FINISHED")
    .map((n) => n.code);
  return {
    current,
    currentCode,
    completed,
    groupUnlocked: completed.includes("TASK_0"),
    outsideUnlocked: completed.includes("W2_REVIEW"),
  };
}
export function makeHomePreview(
  scenario: HomeScenario,
  nodes: readonly JourneyNodeSeedItem[],
  now = new Date(),
) {
  const state = scenarioState(scenario, nodes);
  const countAt = (code: string, scope: PeerScope) =>
    DEMO_PEERS.filter(
      (p) =>
        p.currentCode === code &&
        (scope === "ALL" ||
          (scope === "GROUP"
            ? p.inGroup
            : p.specialization === "UI/UX Designer")),
    ).length;
  const projected = nodes.map((n) => {
    const status = state.completed.includes(n.code)
      ? "COMPLETED"
      : n.code === state.currentCode
        ? "ACTIVE"
        : "LOCKED";
    const locked = status === "LOCKED";
    const progress = (required: number, type: string) =>
      status === "COMPLETED" ||
      (scenario === "WAITING" && n.code === state.currentCode)
        ? required
        : n.code !== state.currentCode
          ? 0
          : type === "apps"
            ? Math.min(
                required,
                scenario === "START" ? 1 : scenario === "WEEK_ONE" ? 3 : 14,
              )
            : type === "tailored"
              ? Math.min(required, 2)
              : 0;
    const requirements = [
      ["apps", "طلبات التقديم", "Applications", n.requiredAppsCount],
      [
        "tailored",
        "طلبات مخصصة",
        "Tailored applications",
        n.requiredTailoredCount,
      ],
      ["posts", "منشورات مهنية", "Professional posts", n.requiredPostsCount],
      ["outreach", "تواصل مهني", "Outreach contacts", n.requiredOutreachCount],
      ...(["REVIEW_STATION", "FINAL_REPORT"].includes(n.nodeType)
        ? [["review", "مراجعة وتسليم", "Review & reflection", 1]]
        : []),
    ]
      .filter((x) => Number(x[3]) > 0)
      .map(([key, titleAr, titleEn, required]) => ({
        key: String(key),
        titleAr: String(titleAr),
        titleEn: String(titleEn),
        required: Number(required),
        current: progress(Number(required), String(key)),
      }));
    const branches: {
      id: string;
      kind: string;
      titleAr: string | null;
      titleEn: string | null;
      value: number | null;
      locked: boolean;
      done: boolean;
    }[] = [];
    for (const r of requirements.filter((r) =>
      ["tailored", "posts", "outreach"].includes(r.key),
    ))
      branches.push({
        id: locked ? `${n.code}-work-${branches.length}` : `${n.code}-${r.key}`,
        kind: locked ? "LOCKED" : r.key.toUpperCase(),
        titleAr: locked ? null : r.titleAr,
        titleEn: locked ? null : r.titleEn,
        value: locked ? null : r.required,
        locked,
        done: status === "COMPLETED",
      });
    const seeds = JOURNEY_GUIDANCE_CATALOG.filter(
      (g) => g.code === n.unlocksInsightCode,
    );
    // Conditional guidance stays attached to its configured week without exposing its content early.
    if (n.code === "W2_M2")
      seeds.push(
        ...JOURNEY_GUIDANCE_CATALOG.filter(
          (g) =>
            g.isAdvanced && !nodes.some((x) => x.unlocksInsightCode === g.code),
        ),
      );
    for (const g of seeds) {
      const open = status === "COMPLETED";
      branches.push({
        id: open ? g.code : `${n.code}-guidance-${branches.length}`,
        kind: open ? "GUIDANCE" : "LOCKED",
        titleAr: open ? g.titleAr : null,
        titleEn: open ? g.titleEn : null,
        value: null,
        locked: !open,
        done:
          open &&
          !(g.code === "INSIGHT_TASK_0_CV_BASE" && scenario === "WEEK_ONE"),
      });
    }
    return {
      code: n.code,
      week: n.weekNumber,
      order: n.orderIndex,
      kind:
        n.nodeType === "FINAL_REPORT"
          ? "FINAL"
          : n.nodeType === "REVIEW_STATION"
            ? "REVIEW"
            : "TASK",
      status,
      titleAr: locked
        ? null
        : n.titleAr.replace(/^الأسبوع\s*\d+\s*-\s*المهمة\s*\d+:\s*/, ""),
      titleEn: locked
        ? null
        : n.titleEn.replace(/^Week\s*\d+\s*-\s*Quest\s*\d+:\s*/i, ""),
      descriptionAr: locked ? null : n.descriptionAr,
      descriptionEn: locked ? null : n.descriptionEn,
      durationDays: locked ? null : n.durationDays,
      requirements: locked ? [] : requirements,
      branches,
      counts: {
        group: state.groupUnlocked ? countAt(n.code, "GROUP") : null,
        specialty: countAt(n.code, "SPECIALTY"),
        all: countAt(n.code, "ALL"),
      },
    };
  });
  const kind =
    scenario === "WEEK_ONE"
      ? "CV"
      : scenario === "FINISHED"
        ? "REPORT"
        : scenario === "WAITING"
          ? "WAIT"
          : "APPLICATION";
  return {
    preview: true as const,
    scenario,
    generatedAt: now.toISOString(),
    currentCode: state.currentCode,
    viewer: {
      nameAr: "رحلتك التجريبية",
      nameEn: "Your example journey",
      specialization: "UI/UX Designer",
      groupUnlocked: state.groupUnlocked,
      outsideUnlocked: state.outsideUnlocked,
      completedCount: state.completed.length,
      totalNodes: nodes.length,
    },
    nextAction: {
      kind,
      stationCode: state.currentCode,
      titleAr:
        kind === "CV"
          ? "خلّي سيرتك تعبّر عن قيمتك"
          : kind === "REPORT"
            ? "رحلتك اكتملت. شوف الصورة كاملة."
            : kind === "WAIT"
              ? "أنجزت المطلوب. محطتك التالية في موعدها."
              : "خطوة واضحة، وتقرّب من هدفك",
      titleEn:
        kind === "CV"
          ? "Make your CV reflect your value"
          : kind === "REPORT"
            ? "Your journey is complete. See the whole picture."
            : kind === "WAIT"
              ? "Work completed. Your next station opens on schedule."
              : "One clear step toward your goal",
      detailAr:
        kind === "CV"
          ? "طبّق إرشاد تأسيس السيرة وارفع النسخة المعدّلة قبل استكمال مهام الأسبوع الأول."
          : kind === "REPORT"
            ? "راجع ما تعلمته، والأدلة التي جمعتها، وخطتك المهنية التالية."
            : kind === "WAIT"
              ? "المراجعة التالية مرتبطة بموعدها في الرحلة. يمكنك مراجعة شغلك الحالي أثناء الانتظار."
              : "كمّل متطلبات محطتك الحالية؛ تقدمك هنا مرتبط بما أنجزته فعلًا.",
      detailEn:
        kind === "CV"
          ? "Apply the foundation guidance and upload your revised CV before continuing week one."
          : kind === "REPORT"
            ? "Review your learning, evidence and next professional steps."
            : kind === "WAIT"
              ? "The next review has a scheduled opening. Revisit your work while you wait."
              : "Continue your current station. Progress follows the work you actually complete.",
      availableAt:
        kind === "WAIT"
          ? new Date(now.getTime() + 86400000).toISOString()
          : null,
    },
    weeks: [0, 1, 2, 3, 4].map((week) => ({
      week,
      titleAr:
        week <= state.current.weekNumber
          ? titles[week][0]
          : "تفاصيلها تظهر في وقتها",
      titleEn:
        week <= state.current.weekNumber
          ? titles[week][1]
          : "Details unfold when you reach them",
      nodes: projected.filter((n) => n.week === week),
    })),
  };
}
export function visiblePeers(
  scenario: HomeScenario,
  nodes: readonly JourneyNodeSeedItem[],
  code: string,
  scope: PeerScope,
  page = 1,
  includeGroup = false,
) {
  if (!nodes.some((n) => n.code === code))
    throw new NotFoundException("Station not found");
  const s = scenarioState(scenario, nodes);
  if (scope === "GROUP" && !s.groupUnlocked)
    throw new ForbiddenException("Complete Task 0 to see your group");
  const matching = DEMO_PEERS.filter(
    (p) =>
      p.currentCode === code &&
      (scope === "ALL" ||
        (scope === "GROUP"
          ? p.inGroup
          : p.specialization === "UI/UX Designer" ||
            (includeGroup && p.inGroup))),
  );
  const allowed = matching.filter((p) =>
    p.inGroup ? s.groupUnlocked : s.outsideUnlocked,
  );
  return {
    items: allowed.slice((page - 1) * 20, page * 20),
    total: allowed.length,
    page,
    pageSize: 20,
    lockedGroupCount: matching.filter((p) => p.inGroup && !s.groupUnlocked)
      .length,
    lockedOutsideCount: matching.filter((p) => !p.inGroup && !s.outsideUnlocked)
      .length,
  };
}
export function previewPeer(
  scenario: HomeScenario,
  nodes: readonly JourneyNodeSeedItem[],
  id: string,
) {
  const p = DEMO_PEERS.find((p) => p.id === id);
  if (!p) throw new NotFoundException("Preview member not found");
  const s = scenarioState(scenario, nodes);
  if (!(p.inGroup ? s.groupUnlocked : s.outsideUnlocked))
    throw new ForbiddenException(
      "Complete the required journey stage to open this profile",
    );
  return p;
}
/** A tiny valid PDF of synthetic preview data; never reads private CV storage. */
export function demoCvPdf(name: string, specialization: string) {
  const clean = (s: string) =>
    s.replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, "\\$&");
  const lines = [
    "NAWAH | SYNTHETIC PREVIEW CV",
    name,
    specialization,
    "",
    "This is sample data for the administrator-only Home B preview.",
    "Skills: research, problem framing, communication and delivery.",
    "User value: make a difficult workflow easier to understand.",
    "Business value: connect decisions to a clear operational goal.",
    "",
    "No real member data or private CV files are included.",
  ];
  const stream = `BT /F1 12 Tf 48 790 Td ${lines.map((l, i) => `${i ? "0 -27 Td " : ""}(${clean(l)}) Tj`).join("\n")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
