import {
  cleanAnswers,
  cleanDraft,
  CONSULTING_KEY,
  ids,
  publishContent,
} from './consulting.validation';
describe('Consultation content and private document boundaries', () => {
  test('meeting links cannot execute scripts, include credentials or use HTTP', () => {
    for (const meetingUrl of [
      'javascript:alert(1)',
      'http://example.com',
      'https://name:password@example.com',
    ])
      expect(() =>
        cleanDraft('SESSION', { goal: 'Explore a question', meetingUrl }),
      ).toThrow();
  });
  test('a published market claim has a region and verification date, rather than treating old book examples as current facts', () => {
    expect(() =>
      publishContent('EVIDENCE', 'Market source', {
        sourceType: 'MARKET_RESOURCE',
        source: 'A dated local source',
        body: 'A tentative market observation',
      }),
    ).toThrow();
    expect(
      publishContent('EVIDENCE', 'Dated source', {
        sourceType: 'MARKET_RESOURCE',
        source: 'https://example.com/resource',
        body: 'Observation, not a guarantee',
        region: 'Egypt',
        observedAt: '2026-11-02T00:00:00.000Z',
      }).region,
    ).toBe('Egypt');
  });
  test('private fields and prototype properties cannot be smuggled into shared work or answers', () => {
    expect(() =>
      publishContent('WORK', 'Agreement', {
        goal: 'Explore',
        criteria: 'Concrete step',
        privateNotes: 'Never shared',
      }),
    ).toThrow();
    expect(() =>
      cleanAnswers(
        {
          prompts: [{ key: 'experience', label: 'Example', kind: 'textarea' }],
        },
        JSON.parse('{"__proto__":{"private":true}}'),
      ),
    ).toThrow();
    expect(() =>
      cleanAnswers(
        {
          prompts: [{ key: 'experience', label: 'Example', kind: 'textarea' }],
        },
        { privateNotes: 'Leak' },
      ),
    ).toThrow();
  });
  test('qualitative prompts may be adapted but do not acquire forged source metadata', () => {
    const d = cleanDraft(
      'ACTIVITY',
      {
        catalogId: 'experience-evidence',
        goal: 'Explore a real example',
        prompts: [
          {
            key: 'example',
            label: 'A concrete example for this person',
            kind: 'textarea',
          },
        ],
        sources: ['forged-source'],
      },
      'en',
    );
    expect(d.prompts[0].label).toBe('A concrete example for this person');
    expect(d.sources).not.toContain('forged-source');
    expect(cleanAnswers(d, { example: 'A real example' })).toEqual({
      example: 'A real example',
    });
  });
  test('private document identifiers do not accept traversal, encoded separators or malformed UUIDs', () => {
    for (const key of [
      '../secret.pdf',
      'career-consulting/../../secret.pdf',
      'career-consulting/%2e%2e.pdf',
      'career-consulting/not-a-uuid.pdf',
    ])
      expect(CONSULTING_KEY.test(key)).toBe(false);
    expect(() => ids(['------------------------------------'])).toThrow();
  });
});
