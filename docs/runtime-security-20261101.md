# Runtime security release, 1 November 2026

This hotfix branches from main `1c275ec`, whose application source and migrations match the current production revision `9a4c6e8`; intervening changes are hosted-release infrastructure and integration fixtures. Studio is intentionally excluded from this first deployment. No schema or journey behavior changes are part of the hotfix.

- Pin Node 24.22.2 Alpine by its linux/amd64 manifest digest. Node 24.22.1 includes the CVE-2026-111497 Brotli decoder fix; 24.22.2 retains it. Verify the actual runtime version in CI and production.
- body-parser 2.4.0 and multer 2.5.0 overrides fix GHSA-27r3-jxmh-p828 and GHSA-q7qp-rjg7-q26m. Nest platform-express 11.2.6 pins vulnerable multer 2.4.0, and published 11.2.7/11.2.8 still pin it; use the narrowly scoped override rather than changing Nest's major version.
- qs 6.16.1, source-map-js 1.2.2 and sanitize-html 2.18.x address compatible runtime patches. Handlebars 4.7.10 and fast-uri 3.1.9 address known development-tool findings without a blanket dependency upgrade.
- The browser API client sends uncompressed JSON and URL-encoded bodies. `requestBodyParsers()` keeps the 1 MiB limit and rejects encoded bodies with `inflate:false`, before any Brotli/gzip/deflate decoder is created. This is defense in depth, not a substitute for removing vulnerable runtime packages.
- Unit regression exercises JSON and form compatibility, benign compressed-body rejection, and continued health. `scripts/security/runtime-checks.cjs` executes inside the actual production image on GitHub with no network or database: patched package/Node assertions, JSON/form requests, compression rejection and patched multer PDF handling.
- CI runs `npm ci`, runtime-only audit at high severity, existing unit/integration/deployment tests, image build and runtime smoke. Remaining low/development advisories are classified separately; no security gate is disabled.

Sources: https://github.com/advisories/GHSA-27r3-jxmh-p828, https://github.com/advisories/GHSA-q7qp-rjg7-q26m, https://nodejs.org/en/blog/vulnerability/october-2026-security-releases, https://nodejs.org/en/blog/release/v24.22.1.
