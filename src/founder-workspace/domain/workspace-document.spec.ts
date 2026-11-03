import { founderTemplate } from './template';
import { validateWorkspaceDocument } from './workspace-document';
const seed = () => JSON.parse(JSON.stringify(founderTemplate));
describe('Founder workspace contract', () => {
  it('accepts the reviewed generic plan without fabricated evidence', () => {
    const d = validateWorkspaceDocument(seed()); expect(d.cycles).toHaveLength(24); expect(d.tasks).toHaveLength(30); expect(d.evidence).toHaveLength(0);
  });
  it.each([
    ['format', d => { d.formatVersion = 2; }],
    ['negative effort', d => { d.tasks[0].hours = -1; }],
    ['unsafe URL', d => { d.tasks[0].resourceUrl = 'javascript:alert(1)'; }],
    ['markup id', d => { d.lanes[0].id = 'bad"'; }],
    ['missing reference', d => { d.tasks[0].cycleId = 'missing'; }],
    ['dependency loop', d => { d.tasks[0].dependsOn = d.tasks[1].id; }],
    ['invented verification', d => { d.practices[0].verified = true; }],
    ['invalid local date', d => { d.tasks[0].start = '2026-02-30'; }],
    ['invalid cycle', d => { d.cycles[0].end = d.cycles[0].start; }],
    ['malformed history', d => { d.history.push({ label: 'Bad', at: 'invalid' }); }],
    ['foreign scope', d => { d.ownerId = 'another-user'; }],
  ] as Array<[string, (d: any) => void]>)('rejects %s', (_, change) => { const d = seed(); change(d); expect(() => validateWorkspaceDocument(d)).toThrow(); });
  it('returns a detached document and accepts local-day scheduling across DST', () => {
    const raw = seed(); raw.tasks[0].start = '2026-10-29'; raw.tasks[0].end = '2026-11-02';
    const d = validateWorkspaceDocument(raw); d.tasks[0].title = 'Changed'; expect(raw.tasks[0].title).not.toBe('Changed');
  });
});
