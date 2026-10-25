# Nawah — Phase 1 Implementation Report

**التاريخ:** 26 أكتوبر 2026، بتوقيت القاهرة.  
**المشروع:** `/data/cms`؛ التعديلات داخل `cms-back` فقط، مع التقرير ده في الجذر.  
**النطاق:** D01، D06، وأدوات backup/recovery. مفيش deployment أو وصول لقاعدة production، ومفيش تعديل في production `.env` أو volumes أو containers القائمة.

## A. Executive summary

Phase 1 اتنفّذت:

1. اتشال `cleanupCorruptedData()` واستدعاؤه من startup؛ restart ما بقاش يحذف user submissions بناءً على كلمات زي «غلط/اسبام/error/spam»، ولا يعيد ترقيم CV versions بعدّ history rows.
2. الـjourney seed بقي **create-only عمليًا** باستخدام `upsert` مع `update: {}`؛ العقد الناقصة تتعمل، والـadmin configuration الموجودة تفضل محفوظة. `getAdminJourneyNodes()` بقي قراءة فقط.
3. اتضافت أداة تشغيلية واحدة بثلاث أوامر: `backup`, `verify`, `restore`، مع recovery Compose template، دليل تشغيل، واختبارات roundtrip معزولة. الأداة تنسخ PostgreSQL وCV files عند نقطة توقف كتابات معلومة، وتسترجع فقط إلى بيئة recovery منفصلة وفارغة.

**النتائج الموجّهة:** 15 unit tests + 3 actual-PostgreSQL integration tests + 8 backup/recovery integration tests نجحوا. Backend production build وproduction TypeScript والـtype-check الخاص بالملفات المعدّلة نجحوا.

**ده مش إعلان جاهزية كل الـMVP:** Full unit suite فيها 92 passed / 14 failed، وfull TypeScript فيه خطأ قديم واحد في `feedback.service.spec.ts`. مفيش إصلاح لـFINAL_REPORT أو metrics أو side-task eligibility أو CV-upload/review side effect أو frontend؛ دي خارج المرحلة. التفاصيل في D وG.

## B. Changed files

### ملفات موجودة اتعدّلت

| الملف | التعديل |
|---|---|
| `cms-back/src/journey-engine/journey-engine.service.ts` | حذف cleanup اللي بيحذف submissions ويطبع CV versions؛ إزالة seed من admin GET. باقي progression/notifications logic كما هو |
| `cms-back/src/journey-engine/journey-v4.seed.ts` | empty update في upsert، مع نفس create defaults والـ25 code/dependencies/quotas |
| `cms-back/src/journey-engine/journey-engine.service.spec.ts` | إصلاح fixtures/mocks داخل suite الـjourney نفسها: week1StartedAt، role، findFirst mocks، واسم prismaMock غير المعرّف |
| `cms-back/README.md` | تصحيح وصف initialization وربط دليل backup consistent بدل نسخ DB وCV منفصلين من غير consistency procedure |

### ملفات اتضافت

| الملف | وظيفته |
|---|---|
| `cms-back/src/journey-engine/journey-initialization.spec.ts` | 4 regression unit tests لـstartup preservation، create-only initialization، pure reads، والـdependency chain |
| `cms-back/test/journey-initialization.integration-spec.ts` | 3 tests على PostgreSQL حقيقية معزولة، تشمل preserving timestamps/progress/history |
| `cms-back/test/jest-phase1.json` | config ضيق للاختبار الجديد؛ نفس event-emitter transform exception الموجودة في unit setup؛ مفيش rewrite للـgeneral test harness |
| `cms-back/scripts/backup/backup.py` | logical DB backup، CV archive/checksums/reference verification، empty isolated target restore |
| `cms-back/scripts/backup/recovery.compose.yml` | PostgreSQL recovery وCV storage carrier متوقف، internal network، من غير host ports أو application startup |
| `cms-back/scripts/backup/test_backup.py` | 8 Docker integration tests ببيانات وvolumes صناعية؛ تختبر الـrecovery template المرفق فعلًا |
| `cms-back/scripts/backup/README.md` | خطوات consistency، التشغيل، off-host، retention، restore/scheduling/failure handling |
| `NAWAH_PHASE_1_IMPLEMENTATION_REPORT.md` | تقرير التنفيذ والقبول الحالي |

الـfrontend فضل clean. `schema.prisma`, migrations، production Compose، package manifests/lockfiles، والـquotas ما اتغيروش. مفيش dependencies جديدة ولا commit/deploy اتعمل.

## C. Root causes and fixes

### C1. D01 — حذف submissions وإعادة كتابة CV versions عند startup

**السبب:** `onModuleInit()` كان بيستدعي cleanup يحذف `SideTaskSubmission` لو نص عادي فيه «غلط» أو «اسبام». وكان بيحوّل `cvVersionNumber` إلى `max(1, count(history))`، وده مش صحيح لو history migrated فيها versions زي 4 و9 بس.

**قبل التعديل:** reflection سليمة زي «صلحت غلط في السيرة الذاتية» ممكن تختفي بعد restart؛ CV version 9 ممكن تنزل إلى 2 من غير أي upload أو موافقة.

**بعد التعديل:** method الخطرة اتشالت بالكامل، واتشال الاستدعاء الوحيد ليها. Initialization تفضل تعمل missing-node seed. مفيش enumeration أو deletion للـsubmissions، ومفيش normalization للـCV state/history من hook دي.

**ليه آمن:** ده إلغاء كتابة وحذف غير مطلوبين، من غير data migration أو تغيير form/API contract. اتراجع كل call site؛ مفيش controller route بيعتمد على method المحذوفة. أي تاريخ محتاج إصلاح يفضل maintenance منفصلة مبنية على records محددة وbackup وموافقة، مش text heuristic.

**الحدود:** ده يمنع loss جديدة؛ ما يرجّعش records سبق حذفها وما يستنتجش CV versions الصحيحة للتاريخ القديم. Notifications dedup logic مالهاش تغيير في المرحلة دي، حسب scope exclusions.

### C2. D06 — seed كان بيرجع admin settings إلى defaults

**السبب:** seed مستخدم `upsert` بكتلة `update` تعيد كل mutable fields للقيم الثابتة، وكان بيتنادى عند startup وعند admin GET.

**قبل التعديل:** تغيير W1_M1 من target 10 إلى11 ثم reload/read يرجّع10. Title/descriptions/duration/unlock settings كانت معرضة لنفس reset.

**بعد التعديل:**

- `where: {code}` يفضل identity للعقدة، والـcreate يحتوي نفس القيم الأصلية.
- `update: {}` ما يكتبش فوق row موجودة؛ actual DB test أكد حتى `updatedAt` ما اتغيرش لمجرد إعادة التهيئة.
- admin GET يقرأ فقط؛ missing defaults تتعمل في initialization، مش في read endpoint.
- fresh DB تاخد نفس الـ25 node من Task0 إلىFINAL_REPORT؛ repeated initialization ما يعملش duplicates.

**التوافق:** Existing IDs/codes وuser journey states لا تتغير. تغيير defaults في source مستقبلًا **مش هيعدّل existing configuration تلقائيًا**؛ التغيير المقصود للعقد الموجودة يبقى admin update أو migration/maintenance محددة ومراجعة. Existing invalid configuration مش هتتصلّح تخمينًا عن طريق seed.

### C3. Backups/recovery

**السبب:** وجود PostgreSQL/CV volumes وحده ما يضمنش recovery، ونسخ CV أثناء uploads ممكن ينتج DB references من غير files متوافقة.

**التنفيذ:** Python stdlib + Docker/PostgreSQL tools الموجودة، بلا service جديدة:

- اختيار source/target من `--compose-file`, `--project` و`--env-file` اختياري. Container IDs، configured storage mounts وPGDATA/CV_STORAGE_DIR بتتجاب من configuration؛ مفيش production container names أو secrets hardcoded.
- `backup` يتطلب `--confirm-quiesced` وAPI containers متوقفة. لا يوقف أي container تلقائيًا. External SQL writers/imports/deployments لازم تتوقف بإجراء operator مستقل.
- PostgreSQL `pg_dump --format=custom --no-owner --no-acl` مع CV tar، full public-table row counts، current/history references، representative user relationship counts، وكل file SHA-256/size/UID/GID/mode.
- Permissions: backup root/set `0700`، الملفات `0600`، umask077، file/directory fsync. اسم كل set timestamp UTC + random UUID؛ لا silent overwrite. الفشل يسيب `.incomplete-*` غير معتمدة.
- `verify` يفحص dump/archive checksums، dump TOC، CV archive members والمراجع والأحجام. بيتحفظ COMPLETE marker بعد التحقق، لكن الرسالة بتوضح إن archive checks مش بديل لاختبار restore.
- `restore` يحتاج target project يبدأ `nawah-recovery-`، opt-in labels، internal network بلا published ports، API متوقفة، DB وCV directory فارغين، وعدم تطابق source cluster/project/container/storage. مفيش clean/drop أو overwrite.
- `pg_restore --single-transaction --exit-on-error --no-owner --no-acl` إلى target فقط، ثم CV extraction في target فقط. بعده actual comparison للـDB counts/relationships/references وكل file hash/owner/mode. الـAPI المتعافية تفضل متوقفة.

**ليه آمن:** source backup عمليات قراءة تحت write downtime معلومة؛ recovery يكتب على target جديدة معلنة ومعزولة فقط. مفيش credential في filenames/logs أو password argument. مفيش automatic restore إلى deployment قائم أو تشغيل application/migrations فوق restored data.

**حدود معلنة:** counts recheck مش snapshot lock ضد external SQL writer غير متوقف؛ flag هي declaration من operator مع API liveness checks، مش freeze سحري. مفيش transaction مشتركة بين PostgreSQL وfilesystem: لو CV extraction/verification فشلت بعد DB restore، recovery target تبقى unapproved وماتبدأش؛ التجربة تتعاد على target جديدة. مش zero-downtime backup solution.

## D. Test results

### D1. بيئة التشغيل

اتراجع `git status` في الفرونت والباك قبل أي تعديل، وكانوا clean. Host مفيهوش Node/npm في PATH؛ اتستخدم cached image `cms-back-verify:dev` (Node v24.21.0) على source copy مؤقتة في `/tmp/nawah-phase1-l36934af/backend`، بعيد عن `.env` وbuild outputs بتاعة المشروع. مفيش dependency install.

Database integration اتشغّلت على PostgreSQL17 جديدة، internal Docker network مستقلة، `cms_test`، بدون ports أو أي اتصال بproduction/development DBs. الـ16 migrations الحالية اتطبّقت على **القاعدة المؤقتة فقط**. الاختبار الجديد يرفض database فيها users أو journey nodes بدل ما ينضفها.

Backup tests أنشأت source/target Compose projects بأسماء عشوائية وnew volumes وsynthetic user/application/review/CV records فقط. الـfixture التشغيلية فيها 7 tables بعلاقات FK وملفين CV، مع versions4 و9 وtarget11؛ DB journey tests استخدمت actual Prisma schema كاملة. الاختبارات ما استعملتش actual user data.

### D2. أوامر ونتائج فعلية

الأوامر الجاية اتنفّذت داخل source copy، إلا Python/Docker backup tests اللي اتنفّذت من `cms-back`:

| الأمر | النتيجة |
|---|---|
| `npm run prisma:generate` | PASS؛ client مطابق للـschema الحالية |
| `npm run build` | PASS، exit0 |
| `./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.build.json` | PASS، exit0 — كل production TypeScript |
| `npm test -- --runInBand journey-engine.service.spec.ts journey-initialization.spec.ts` | PASS — 2 suites / **15 tests** |
| `./node_modules/.bin/prisma migrate deploy` ضد DB المعزولة | PASS — 16 migrations الحالية؛ مفيش migration جديدة |
| `./node_modules/.bin/jest --config test/jest-phase1.json --runInBand` | PASS — **3 integration tests** |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.phase1-check.json` بconfig مؤقت يشمل الملفات المعدلة والجديدة واختبار integration | PASS، exit0 |
| `python3 scripts/backup/test_backup.py` | PASS — **8 tests**؛ آخر run استخدم actual recovery.compose.yml، استغرق ~124 ثانية |
| Python `ast.parse` لـbackup.py وtest_backup.py | PASS؛ بدون توليد artifacts في source |
| `docker compose ... -f scripts/backup/recovery.compose.yml ... config --quiet` بenv صناعي | PASS |
| `git diff --check` | PASS |
| `./node_modules/.bin/tsc --noEmit --incremental false` | FAIL، exit2 — error قديم واحد في feedback.service.spec.ts:33 |
| `npm test -- --runInBand` | FAIL، exit1 — **92 passed / 14 failed، 15 suites passed / 4 failed** |

الـconfig المؤقت لفحص الملفات المعدلة extends `tsconfig.json` ويضبط `rootDir: '.'`, `incremental:false`، ويشمل service، seed، journey service spec، initialization spec، وintegration spec؛ بيستبعد dist/node_modules فقط. ما اتضافش config عام عشان نلف حوالين خطأ غير متعلق بالمرحلة. الـfull check اتشغّل واتسجل فشله بدل إخفائه.

Logs التنفيذ المؤقتة: `checks.log`, `integration-final.log`, `broader-checks.log`, `backup-template-checks.log` تحت `/tmp/nawah-phase1-l36934af/`. النتائج الأساسية متضمنة هنا عشان التقرير ما يعتمدش على بقاء `/tmp`.

### D3. Regression evidence

**Unit coverage:** كلمات «غلط/اسبام/error/spam» تفضل في submissions بعد initialization مرتين؛ CV version9 مع histories4 و9 لا يتغير؛ required nodes تتعمل؛ missing node يتملأ من غير overwrite admin fields؛ GET لا ينادي seed؛ الـchain تصل لكل الـ25 node من غير cycle/dangling reference.

**Actual DB coverage:**

1. Fresh schema initialize →25 nodes بالترتيب الأصلي.
2. Admin update إلى11 + description مخصصة →GET وبعد reinitialization مرتين يرجعوا نفس row، بنفس ID وupdatedAt؛ count يفضل25.
3. Snapshot قبل/بعد initialization للـsubmissions، UserJourneyState، وCV history →تطابق كامل. Reflection العربية وLinkedIn post موجودين؛ version9 محفوظة رغم إن history rows عددها2 فقط.

**Backup/recovery coverage:**

1. Archive verification + backup directory/file permissions.
2. Corrupted dump checksum يترفض.
3. CV reference غير موجودة في archive تترفض.
4. Nonempty recovery CV directory تترفض قبل DB restore.
5. Running synthetic API carrier يمنع backup.
6. Source environment target يترفض، والمصدر كما هو.
7. Symlink داخل archive تترفض حتى لو checksum اتحدثت.
8. Backup تاني ما يكتبش فوق الأول؛ restore حقيقية إلى recovery template الجديدة؛ snapshot لكل بيانات fixture والـCV hashes يطابق المصدر؛ source snapshot قبل/بعد زي بعض؛ إعادة restore فوق DB المليانة تترفض؛ target API تفضل stopped.

نجاح الاختبارات الثمانية متكرر، وآخر run اختبر نفس recovery template المرفقة للمشغّل. مجرد `pg_dump` exit0 ما اعتبرناهوش إثبات صلاحية؛ `pg_restore` ومطابقة البيانات والملفات اتنفّذوا فعلًا.

### D4. الإخفاقات المتبقية خارج النطاق

- Full TypeScript: `src/feedback/feedback.service.spec.ts:33` constructor args mismatch، من قبل Phase1؛ ما اتغيرش الملف.
- Full units: `profile.service.spec.ts`, `members.service.spec.ts`, `tasks.service.spec.ts`, `feedback.service.spec.ts` ما زالوا يفشلوا بسبب mocks/fixtures القديمة الخاصة بوحداتهم أو unlock expectations. لا يوجد failure في journey suites بعد التعديلات.
- General E2E harness المبني على AppModule لم يتم إعادة بنائه أو إصلاح sanitize-html/ESM الخاص بالمراجعة السابقة. بدل ما ندّعي إنه شغّال، استخدمنا scoped DB integration config للمطلوب هنا. ده مش full product-flow QA.
- لم يتم تشغيل live production backup، أو تعديل scheduler/cron فعلي، أو نسخ بيانات مستخدمين off-host، أو failover إلى production، أو browser/Frontend QA. الأدوات وإجراء التشغيل موجودين ومجربين على synthetic environments فقط.

## E. Backup and restore instructions

الدليل التنفيذي الكامل: [cms-back/scripts/backup/README.md](/data/cms/cms-back/scripts/backup/README.md). الأوامر تستخدم variables يحددها المشغّل؛ مفيش secrets في الأمثلة.

### E1. Consistency وbackup

قبل النسخ، operator يحدد maintenance window ويوقف كتابات الـAPI/workers/imports/external SQL والـdeployments. الأداة لا توقفهم ولا تعيد تشغيلهم. Container configuration للـAPI لازم تفضل موجودة عشان اكتشاف mount؛ `docker compose down` مش مطلوب.

من `cms-back` وعلى Docker host نفسه:

```bash
# اضبطهم حسب configuration الحقيقية، بدون وضع password في القيمة أو اسم backup.
NAWAH_SOURCE_COMPOSE=/absolute/path/to/compose.yml
NAWAH_SOURCE_PROJECT=actual-compose-project
NAWAH_SOURCE_ENV=/absolute/private/path/to/existing.env
NAWAH_BACKUP_ROOT=/absolute/private/backups

install -d -m 700 "$NAWAH_BACKUP_ROOT"
python3 scripts/backup/backup.py backup \
  --compose-file "$NAWAH_SOURCE_COMPOSE" \
  --project "$NAWAH_SOURCE_PROJECT" \
  --env-file "$NAWAH_SOURCE_ENV" \
  --output-dir "$NAWAH_BACKUP_ROOT" \
  --confirm-quiesced
```

Source services الافتراضية postgres/api، قابلة للتغيير بflags. PostgreSQL نفسها بتفضل شغالة لعمل logical dump. Existing DB role/password environment داخل container؛ لا تتنسخ `.env` ضمن set ولا تظهر في command output. Requirements: Python3.11+، Docker/Compose access، PostgreSQL compatible image محلية، persistent configured mounts، وbackup directory على filesystem اللي Docker daemon شايفه.

### E2. مكان النسخة والتحقق/off-host

الناتج set جديدة تحت output-dir، فيها `database.dump`, `cv-files.tar`, `manifest.json`, `COMPLETE`. Snapshot فيها current/history metadata من DB وكل CV files، مش current CV بس. Incomplete directories تفضل غير معتمدة، ومفيش pruning تلقائي.

```bash
NAWAH_BACKUP_SET=/absolute/path/to/completed/nawah-snapshot
python3 scripts/backup/backup.py verify "$NAWAH_BACKUP_SET"

# مثال بعد ضبط SSH/storage فعليًا؛ لا password/token في destination.
NAWAH_OFFHOST_DEST=backup-user@backup-host:/private/nawah-backups/
rsync -a -- "$NAWAH_BACKUP_SET" "$NAWAH_OFFHOST_DEST"
```

اتحقق من النسخة على الجهة التانية كمان، وحافظ على private permissions وencrypted storage/transport وrestricted access. Dump فيها personal/authentication data موجودة أصلًا؛ SHA-256 تكشف corruption ومش signature ضد attacker بيغيّر manifest. الاحتفاظ المقترح للـpilot **7 daily +4 weekly** حسب مساحة الملفات وأهداف الاستعادة؛ لا تنضف older sets قبل وجود verified off-host copy، والحذف يبقى سياسة operator مراجَعة.

### E3. Recovery منفصلة

جهز env جديدة mode0600 خارجGit فيها `RECOVERY_POSTGRES_IMAGE`, `RECOVERY_POSTGRES_USER`, `RECOVERY_POSTGRES_PASSWORD` عشوائية مستقلة، و`RECOVERY_POSTGRES_DB`. استعمل نفس compatible PostgreSQL major. القالب لا يستخدم API production image؛ service api مجرد carrier للـCV volume.

```bash
NAWAH_RECOVERY_PROJECT=nawah-recovery-drill-unique-id
NAWAH_RECOVERY_COMPOSE="$PWD/scripts/backup/recovery.compose.yml"
NAWAH_RECOVERY_ENV=/absolute/private/path/to/recovery.env

docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" up -d --pull never postgres

docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" create --pull never api

# اتأكد إن القاعدة الجديدة جاهزة قبل restore.
docker compose -f "$NAWAH_RECOVERY_COMPOSE" -p "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" exec -T postgres sh -ceu \
  'pg_isready --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"'

python3 scripts/backup/backup.py restore "$NAWAH_BACKUP_SET" \
  --compose-file "$NAWAH_RECOVERY_COMPOSE" \
  --project "$NAWAH_RECOVERY_PROJECT" \
  --env-file "$NAWAH_RECOVERY_ENV" \
  --confirm-isolated-recovery
```

لا `migrate deploy` ولا app startup ولا public exposure ضمن الإجراء. Success يعني counts وrepresentative FK relationships وCV references وfile names/hashes/permissions اتطابقوا؛ اختبار roundtrip كمان قارن كل actual synthetic rows. Check UID/GID compatibility مع app image قبل deployment لاحقة. أي failure يخلي target unapproved؛ احتفظ بالتشخيص واعمل target جديدة بدل force/overwrite. Actual production failover محتاجة عملية deployment مستقلة ومراجَعة.

### E4. Scheduling

ممكن existing cron/scheduler يشغّل backup command بabsolute paths وprivate log **داخل maintenance window متفق عليها**. `--confirm-quiesced` لا يوقف الكتابات: لو الـAPI لسه شغالة، schedule يفشل. المطلوب تنبيه على exit1/2 وعلى stale last-success، وخطوة مستقلة لتوقف/إعادة الخدمات بواسطة operator مخوّل. المثال الكامل موجود في README. لم يتم إضافة cron أو تغيير خدمة قائمة هنا؛ الأداة مش unattended zero-downtime backup platform.

## F. Deployment precautions

1. راجع deployment target mapping: repo الحالي تحت `/data/cms/cms-back`، بينما workflows القائمة تشير لمسارات deployment مختلفة. ما تعملش deploy على مسار بالتخمين.
2. قبل أول restart للنسخة القديمة: اعمل approved write downtime وconsistent backup بالأداة، من غير إعادة تشغيل التطبيق القديم عشان تعمل backup؛ startup القديمة هي موضع الخطر.
3. راجع diff؛ production change الأساسية في service/seed فقط. لا schema migration جديدة، ولا تغيير quota/unlock/controller contract.
4. افحص restored snapshot في isolated environment، وتحقق من وجود كل current/history CV files. Missing file/reference تحتاج record-specific investigation، مش cleanup أو إعادة ترقيم تلقائية.
5. Existing admin edits اللي سبق اتعملها reset مش هترجع من نفسها. لازم أصل موثوق/backup وmaintenance مستقلة لأي استرداد. تعديل defaults مستقبلًا يحتاج اختيار صريح لتعديل existing nodes.
6. ما تستخدمش real API image عشان recovery carrier؛ entrypoint الحالي بيشغّل migrations، وbackground jobs قد تغيّر restored data. القالب المرفق بيتجنب ده عمدًا.
7. Full type/unit failures لسه موجودة خارج Phase1؛ ما تصنّفش CI كله green. نتائج scoped tests وproduction build منفصلة عن جاهزية المرحلة التالية.
8. لم يتم تشغيل Docker Compose production أو تغيير active containers/volumes القائمة. الـtest resources اللي أنشأناها بس اتقفلت واتشالت بعد التحقق؛ credentials الصناعية ظلت في private temporary files فقط.

## G. Remaining issues

المرجع: [NAWAH_LIVE_CODE_AUDIT.md](/data/cms/NAWAH_LIVE_CODE_AUDIT.md).

- D01 وD06 اتصلحوا في source واتغطوا بـregression tests؛ historical losses/overwritten configuration محتاجة approved recovery لو لزم، ومش اتصلحت تخمينًا.
- D02 `FINAL_REPORT`، D03–D05 side-task/review/CV semantics، D07–D10 unlock/event/timing consistency: خارج المرحلة كما اتطلب.
- R01–R03 metrics/reporting وcausal wording، H01–H03 group visibility/cache/OTP logging، readiness/auth recovery، وUX/type issues الخاصة بالفرونت: ما اتنفذتش.
- broader profile/member/task/feedback test fixtures وgeneral E2E harness لسه محتاجين المراحل الجاية. مفيش تغيير في business rules عشان نعدّي test.
- Production-specific backup scheduling/off-host policy وrestore drill على نسخة مستخدمين فعلية تحتاج operator approval مستقلة؛ الأدوات سليمة على synthetic fixtures، مش شهادة على backup حالية لم يتم قراءتها.

**Blockers داخل Phase1:** مفيش blocker باقٍ يمنع تسليم الإصلاحات والأدوات المجربة. **Blockers للإطلاق العام:** الـFINAL_REPORT وباقي critical findings والـbroader checks لسه موجودين؛ مفيش تصريح إن كل الـMVP جاهز للنشر.

## H. Final acceptance checklist

البنود المتعلّمة مرتبطة بالاختبارات الصناعية المنفّذة، مش بdeployment أو backup للـproduction:

- [x] Startup no longer deletes legitimate submissions — unit وactual DB؛ ordinary Arabic/English text محفوظ.
- [x] CV version metadata survives restart — initialization متكررة على DB فيها versions4 و9، مع current version9، بلا تغيير في history/state.
- [x] Administrator journey edits persist — target11 وdescription وupdatedAt محفوظين عبر reads/reinitialization.
- [x] Journey initialization remains idempotent — repeated startup بلا duplicates أو overwrites؛ read endpoint بلا seed.
- [x] Fresh database initialization succeeds — migrations الحالية +25 nodes على PostgreSQL جديدة.
- [x] Backup completes successfully — archive/checksum/reference checks على synthetic source.
- [x] Isolated restore succeeds — actual recovery Compose template وtarget جديدة.
- [x] Database and CV data integrity verified — counts/relationships/records وCV hashes/ownership/modes؛ original synthetic source unchanged.
- [x] Relevant regression tests pass —15 unit +3 DB integration +8 backup/recovery؛ unrelated failures موثقة.
- [x] No unrelated application changes — frontend/schema/quotas/production config كما هي؛ تغييرات المصدر محصورة في Phase1.
