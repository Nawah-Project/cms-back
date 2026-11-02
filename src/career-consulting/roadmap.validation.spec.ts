import { cleanRoadmap } from './roadmap.validation';
describe('Private roadmap content boundaries', () => {
  it('preserves text without executable HTML rendering or arbitrary state fields', () => {
    expect(
      cleanRoadmap({
        context: '<b>plain source text</b>',
        userId: 'must-not-link',
        consent: true,
      }),
    ).toEqual({
      context: '<b>plain source text</b>',
      observations: [],
      sources: [],
      notes: {},
    });
  });
  it('bounds notes and refuses unsafe links or unsupported classifications', () => {
    expect(() =>
      cleanRoadmap({ notes: { prepare: 'a'.repeat(5001) } }),
    ).toThrow();
    expect(() =>
      cleanRoadmap({
        observations: [{ kind: 'DIAGNOSIS', text: 'Not a clinical tool' }],
      }),
    ).toThrow();
    for (const url of [
      'http://example.com',
      'javascript:alert(1)',
      'https://user:secret@example.com',
    ])
      expect(() =>
        cleanRoadmap({
          sources: [{ title: 'Source', url, checked: '2026-11-02' }],
        }),
      ).toThrow();
  });
});
