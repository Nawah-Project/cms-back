# Consulting preparation roadmaps

Fourth staff entry: `/admin/career-consulting?view=maps`. A DOM/SVG practice map shows a branching, revisable process, with keyboard-operable stage buttons, responsive layout, optional expansion, tool instructions and printed book locators. The template is an original synthesis of the supplied texts, not a reproduction of the books or a clinical protocol.

The person’s uncertainty is the starting point. Intake and service agreement precede shared work. Work experience/values and a dated search/market audit can inform a joint understanding in parallel. Select a justified intervention, review what a small experiment actually taught, compare alternatives against the person's criteria, offer a reasoned recommendation, record their decision and review benefit. Revisit understanding whenever evidence or goals change. The map does not prescribe sessions or claim task completion equals career success.

## Privacy and persistence

`CareerConsultingRoadmap` is independent of cases, participants, consent, research and Journey. It stores consultant preparation only. Creation cannot select another owner or link/invite a participant. Existing permissions do not expand. `CAREER_CONSULTING` READ/WRITE is checked from the database on every operation; a map is visible only to its owner or Root. READ cannot create/update/delete. Members have no roadmap API. Maps have explicit, immutable retention within one year; the UI defaults to 90 days. Expired maps disappear immediately and are purged every 30 minutes. Deleting an owner cascades their maps; editing never extends retention. Existing full-database backups include maps, and backup deletion follows the existing retention cycle.

The JSON shape is bounded and allowlisted: context, labelled observations, dated sources and stage-keyed preparation notes. It contains no actual case progress, participant linkage or consent. URLs must be HTTPS without credentials. Content renders as text. List responses omit content. Personal analysis is entered into the protected API only, never public source, sample data, CI logs, build assets, training pages or analytics. No copy of the supplied CV is stored by this feature. No private content is logged in request/error telemetry; existing consulting route exclusions apply.

Create retries use owner/request UUID + content hash and a transaction advisory lock. Edits use revision compare-and-swap plus last-request replay. Conflict leaves editor text intact. Native navigation/reload prompts guard unsaved preparation. Source status is explicit (accessible, partial, unavailable, closed listing); a closed job is not a live lead. The UI does not auto-promote source claims into verified evidence.

## API

Admin-only `/admin/career-consulting/roadmaps`: `GET /template`, paginated `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`. No participant route. API content mutations cannot write other modules. A preparation map is not a substitute for service consent or a session record.

## Verification and deployment

E2E tests use a disposable `cms_test` database: owner/Root isolation, reader/outsider/member denial, no participant route, concurrent create replay, conflicts, unsafe source URLs, retention/purge/deletion, unchanged case counts, permissions and Journey state. Unit tests bound payloads. Browser checks cover RTL/LTR, small screens, keyboard stage selection, expansion, note persistence and conflict feedback.

One additive table/index/FK migration; no reset, seed, existing-row update or programme migration. Deploy backend first through hosted CI/approved releases, after verified PostgreSQL/CV backup and isolated restore/migration rehearsal. Previous images remain a valid application rollback; rollback does not undo this migration. Old application images ignore this table. Preserve real private maps when reverting an application image.

## Professional sources

- Dugger, *Foundations of Career Counseling*, Ch. 9 pp. 174–181; Ch. 10 pp. 203–213: intake, goals, strategies and review.
- Tang, *Career Development and Counseling*, Ch. 6 pp. 162–170: working alliance, information, options, implementation and follow-up.
- Rochat, *Mapping Career Counseling Interventions*, Introduction pp. 6–9; Ch. 4 §§4.2–4.5 pp. 76–85; Ch. 5 §§5.1, 5.3–5.4 pp. 94–108; Ch. 6 §§6.1–6.4 pp. 124–133; Ch. 7 §§7.4–7.7 pp. 151–160: select and adapt an intervention to a specific difficulty; critically examine sources and ambivalence.
- Capuzzi & Stauffer (eds.), *Career Counseling*, Ch. 8 pp. 223–243: collaborative, revisable career planning and evidence-informed next steps.

Page locators use printed pages. Market sources need independent current dates/countries; book examples are not current Saudi job data. No standardised tests, diagnosis, inferred nationality, hiring probabilities or forced career recommendation are introduced.
