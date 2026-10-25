import { sanitizeFeedbackContent } from './content-sanitizer';
describe('Real feedback sanitizer', () => {
  it('preserves paragraphs while removing executable HTML and unsafe links', () => {
    const html = sanitizeFeedbackContent(
      '<p>Useful guidance</p><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">Read</a>',
    );
    expect(html).toContain('<p>Useful guidance</p>');
    expect(html).not.toMatch(/script|onclick|javascript:/i);
  });
});
