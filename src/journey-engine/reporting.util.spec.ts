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
  });
});
