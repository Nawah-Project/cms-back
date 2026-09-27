import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'a',
    'code',
    'pre',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: { a: ['http', 'https'] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
    }),
  },
  disallowedTagsMode: 'discard',
};

export function sanitizeFeedbackContent(content: string): string {
  const clean = sanitizeHtml(content, options).trim();
  const text = sanitizeHtml(clean, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
  if (!text) throw new BadRequestException('Feedback content cannot be empty');
  if (clean.length > 20000) {
    throw new BadRequestException('Feedback content is too long');
  }
  return clean;
}

export function isSafeFeedbackResourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      value.length <= 2048
    );
  } catch {
    return false;
  }
}

export function sanitizeFeedbackHtml(content: string): string {
  return sanitizeHtml(content, options);
}
