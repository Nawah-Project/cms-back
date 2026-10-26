import { buildDemoReports } from './reporting.util';

describe('admin report preview demo fixture', () => {
  it('is deterministic and covers empty, pending, mixed, incomplete-history and complete-journey cases', () => {
    const report = buildDemoReports();
    expect(JSON.stringify(buildDemoReports())).toBe(JSON.stringify(report));

    expect(report.weeks.map(({ week }) => week)).toEqual([0, 1, 2, 3, 4]);
    expect(report.weeks[1]).toMatchObject({ logged: 0, positive: 0, positiveRate: null });
    expect(report.weeks[2]).toMatchObject({ logged: 2, positive: 0, interviews: 0 });
    expect(report.weeks[3]).toMatchObject({
      logged: 3,
      positive: 2,
      interviews: 1,
      assignments: 1,
      unknownInterviews: 2,
      rejected: 1,
    });
    expect(report.weeks[4]).toMatchObject({
      logged: 4,
      positive: 1,
      accepted: 1,
      rejected: 1,
      withdrawn: 1,
      noResponse: 1,
      unknownInterviews: 2,
    });
    expect(report.overall).toMatchObject({ logged: 9, positive: 3, posts: 1, outreach: 1, reviews: 3 });
    expect(report.finalAvailable).toBe(true);
    expect(report.completed).toBe(true);
    expect(report.completedNodeCodes).toContain('FINAL_REPORT');
    expect(report.activities.every((activity) => activity.id.startsWith('demo-'))).toBe(true);
    expect(report.cvs.every((cv) => cv.originalName.startsWith('DEMO-'))).toBe(true);
    expect(report.weeklyStages.find((week) => week.week === 1)).toMatchObject({
      available: true,
      complete: true,
      reflectionRecorded: false,
    });
    expect(report.weeklyStages.find((week) => week.week === 2)?.nextStage?.titleEn).toContain('Week 3');
    expect(report.readGuidance.map((item) => item.titleEn)).toContain('Skills, useful solutions and impact: improve your CV');
  });

  it('provides deterministic DTO-compatible scenarios without touching persistence', () => {
    const empty = buildDemoReports('EMPTY');
    const one = buildDemoReports('ONE');
    const early = buildDemoReports('EARLY');
    const week1Complete = buildDemoReports('WEEK1_COMPLETE');
    const week3Complete = buildDemoReports('WEEK3_COMPLETE');
    const populated = buildDemoReports('POPULATED');

    expect(empty.overall.logged).toBe(0);
    expect(empty.cvs).toEqual([]);
    expect(one.overall.logged).toBe(1);
    expect(one.cvs).toHaveLength(1);
    expect(early.overall.logged).toBe(5);
    expect(early.overall.interviews).toBe(1);
    expect(early.overall.assignments).toBe(1);
    expect(early.weeklyStages.find((week) => week.week === 1)).toMatchObject({
      available: true,
      complete: false,
      currentWeekStartedAt: new Date('2026-10-05T12:00:00.000Z'),
    });
    expect(early.weeklyStages.find((week) => week.week === 2)).toEqual({
      week: 2,
      available: false,
    });
    expect(week1Complete.overall.logged).toBe(3);
    expect(week1Complete.weeklyStages.find((week) => week.week === 1)).toMatchObject({
      available: true, complete: true, reflectionRecorded: true,
    });
    expect(week1Complete.weeklyStages.find((week) => week.week === 3)).toEqual({
      week: 3, available: false,
    });
    expect(week3Complete.overall.logged).toBe(15);
    expect(week3Complete.weeklyStages.filter((week) => week.available).map((week) => week.week)).toEqual([1, 2, 3, 4]);
    expect(week3Complete.weeklyStages.slice(0, 3).every((week) => week.complete && week.reflectionRecorded)).toBe(true);
    expect(week3Complete.finalAvailable).toBe(false);
    expect(week3Complete.completed).toBe(false);
    expect(populated.overall.logged).toBe(30);
    expect(populated.cvs.map((cv) => cv.versionNumber)).toEqual([1, 2]);
    expect(populated.activities.filter((item) => item.type === 'USER_CHANGE')).toHaveLength(2);
    expect(populated.completed).toBe(false);
    expect(populated.weeklyDaily.some((row) => row.week === 4)).toBe(true);
    expect(populated.weeklyDaily.some((row) => row.week === 1 && row.date === '2026-09-01')).toBe(true);
    expect(JSON.stringify(buildDemoReports('POPULATED'))).toBe(JSON.stringify(populated));
  });
});
