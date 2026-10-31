import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JOURNEY_V4_NODES } from "../journey-engine/journey-v4.seed";
import {
  DEMO_PEERS,
  demoCvPdf,
  HOME_SCENARIOS,
  makeHomePreview,
  previewPeer,
  scenarioState,
  visiblePeers,
} from "./home-preview.model";
const nodes = JOURNEY_V4_NODES;
describe("Home B preview projections and access", () => {
  test.each(HOME_SCENARIOS)(
    "%s uses the configured topology without mutating it",
    (scenario) => {
      const before = JSON.stringify(nodes),
        h = makeHomePreview(scenario, nodes, new Date("2026-10-27T12:00:00Z"));
      expect(h.weeks.flatMap((w) => w.nodes).map((n) => n.code)).toEqual(
        nodes.map((n) => n.code),
      );
      expect(JSON.stringify(nodes)).toBe(before);
      expect(
        h.weeks.flatMap((w) => w.nodes).filter((n) => n.status === "ACTIVE"),
      ).toHaveLength(scenario === "FINISHED" ? 0 : 1);
      expect(h.preview).toBe(true);
    },
  );
  test("locked nodes never serialize actual descriptions, requirements or branch titles", () => {
    const h = makeHomePreview("START", nodes);
    for (const n of h.weeks
      .flatMap((w) => w.nodes)
      .filter((n) => n.status === "LOCKED")) {
      expect(n.titleAr).toBeNull();
      expect(n.descriptionEn).toBeNull();
      expect(n.durationDays).toBeNull();
      expect(n.requirements).toEqual([]);
      expect(
        n.branches.every(
          (b) => b.titleAr === null && b.titleEn === null && b.value === null,
        ),
      ).toBe(true);
      expect(n.counts.all).toBeGreaterThanOrEqual(0);
    }
  });
  test("before Task zero only aggregate peer counts are visible", () => {
    expect(() => visiblePeers("START", nodes, "TASK_0", "GROUP")).toThrow(
      ForbiddenException,
    );
    const p = visiblePeers("START", nodes, "TASK_0", "ALL");
    expect(p.items).toEqual([]);
    expect(p.lockedOutsideCount + p.lockedGroupCount).toBeGreaterThan(0);
    expect(
      makeHomePreview("START", nodes).weeks[0].nodes[0].counts.group,
    ).toBeNull();
  });
  test("week one can see same-group people but not outside identities or CVs", () => {
    const p = visiblePeers("WEEK_ONE", nodes, "W1_M1", "ALL");
    expect(p.items.every((x) => x.inGroup)).toBe(true);
    expect(p.lockedOutsideCount).toBe(2);
    const outsider = DEMO_PEERS.find((p) => !p.inGroup)!;
    expect(JSON.stringify(p)).not.toContain(outsider.nameEn);
    expect(() => previewPeer("WEEK_ONE", nodes, outsider.id)).toThrow(
      ForbiddenException,
    );
    expect(previewPeer("WEEK_ONE", nodes, "demo-02").inGroup).toBe(true);
  });
  test("outside profiles open only when W2_REVIEW is in completed nodes", () => {
    expect(scenarioState("AFTER_WEEK_TWO", nodes).completed).toContain(
      "W2_REVIEW",
    );
    const outsider = DEMO_PEERS.find((p) => !p.inGroup)!;
    expect(previewPeer("AFTER_WEEK_TWO", nodes, outsider.id)).toEqual(outsider);
    expect(
      visiblePeers("AFTER_WEEK_TWO", nodes, "W1_M1", "ALL").lockedOutsideCount,
    ).toBe(0);
  });
  test("specialty filtering differs from all specialties and does not duplicate people", () => {
    const a = visiblePeers("AFTER_WEEK_TWO", nodes, "W2_M2", "ALL"),
      s = visiblePeers("AFTER_WEEK_TWO", nodes, "W2_M2", "SPECIALTY");
    expect(a.items.length).toBeGreaterThan(s.items.length);
    expect(s.items.every((x) => x.specialization === "UI/UX Designer")).toBe(
      true,
    );
    expect(new Set(a.items.map((x) => x.id)).size).toBe(a.items.length);
    expect(
      visiblePeers("AFTER_WEEK_TWO", nodes, "W2_M2", "ALL", 2).items,
    ).toEqual([]);
  });
  test("foreign identifiers and invalid stations cannot read any production identity", () => {
    expect(() =>
      previewPeer("FINISHED", nodes, "aeef0606-17bb-47b6-a239-4a44526303b4"),
    ).toThrow(NotFoundException);
    expect(() => visiblePeers("FINISHED", nodes, "INVALID", "ALL")).toThrow(
      NotFoundException,
    );
  });
  test("the CV foundation and waiting states name the real next action", () => {
    expect(makeHomePreview("WEEK_ONE", nodes).nextAction.kind).toBe("CV");
    const h = makeHomePreview(
      "WAITING",
      nodes,
      new Date("2026-10-27T12:00:00Z"),
    );
    expect(h.nextAction.kind).toBe("WAIT");
    expect(h.nextAction.availableAt).toBe("2026-10-28T12:00:00.000Z");
    expect(makeHomePreview("FINISHED", nodes).viewer.completedCount).toBe(
      nodes.length,
    );
  });
  test("synthetic CV is a valid standalone PDF with correct xref offset", () => {
    const pdf = demoCvPdf("Omar (example)", "UI/UX Designer").toString();
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("SYNTHETIC PREVIEW");
    const offset = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(offset, offset + 4)).toBe("xref");
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
  });
  test("combined scope deduplicates before paging and preserves member access rules", () => {
    const combined = visiblePeers(
      "AFTER_WEEK_TWO",
      nodes,
      "W2_M2",
      "SPECIALTY",
      1,
      true,
    );
    expect(combined.items).toHaveLength(2);
    expect(new Set(combined.items.map((p) => p.id)).size).toBe(2);
    expect(
      combined.items.some(
        (p) => p.inGroup && p.specialization !== "UI/UX Designer",
      ),
    ).toBe(true);
    const previous = visiblePeers(
      "WEEK_ONE",
      nodes,
      "W2_M2",
      "SPECIALTY",
      1,
      true,
    );
    expect(previous.items.every((p) => p.inGroup)).toBe(true);
    expect(previous.lockedOutsideCount).toBe(1);
  });
});
