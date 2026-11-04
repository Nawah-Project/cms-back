import { json, urlencoded, raw } from 'express';

// Browser clients send uncompressed bodies. Reject encoded bodies before zlib
// creates a decoder; this is defense in depth beyond patched body-parser/Node.
export function requestBodyParsers() {
  return [
    json({
      type: (req) =>
        Boolean(
          req.url === '/admin/learning-library/restore' &&
          req.headers['content-type']?.startsWith('application/json'),
        ),
      limit: '32mb',
      inflate: false,
    }),
    raw({
      type: (req) =>
        Boolean(
          req.url?.startsWith('/admin/learning-library/transfers/') &&
          req.headers['content-type'] === 'application/octet-stream',
        ),
      limit: '1mb',
      inflate: false,
    }),
    json({ limit: '1mb', inflate: false }),
    urlencoded({ extended: false, limit: '1mb', inflate: false }),
  ];
}
