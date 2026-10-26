# نواة — نشر إعادة تصميم Analytics على الإنتاج

**الحالة:** **DEPLOYED — READY FOR LIVE BROWSER QA**.
**التاريخ:** 26 أكتوبر 2026 UTC.
**Compose project:** `cms-back`؛ بيانات الإنتاج الحالية محفوظة.

## 1. الإصدار

تم نشر النسخة المتوافقة من Backend وFrontend معًا:

| الخدمة | فرع المصدر | commit المصدر | Image tag | Image ID |
|---|---|---|---|---|
| Backend | `feature/analytics-redesign` | `0a8e3f92d646ed99bb6475f700748516c3ab9bf8` | `cms-back-api:nawah-analytics-redesign-20261026-0a8e3f9` | `sha256:84057c52715a4abc2d66a0b6583241e7f431e6f8f551d95f5b80e040078941f9` |
| Frontend | `feature/analytics-redesign` | `b9ad1ffff7c467d5111599baa0a620ff8df12a79` | `cms-back-frontend:nawah-analytics-redesign-20261026-b9ad1ff` | `sha256:6bb30c0b1d35e948cf0bd009bd1f01bf43a674f80505bd741f57edd020ddd9c6` |

Commits التوثيق المضمّنة في الـcheckout: Backend `a9d6b7a`، Frontend `c294c45`. الـworking trees كانت clean. الـCompose overlay الجديد: [compose.analytics-redesign-production.yml](/data/cms/compose.analytics-redesign-production.yml).

## 2. تحقق البيئة وschema قبل النشر

راجعت labels للخدمات قبل التحديث؛ المشروع كان `cms-back` وملفات Compose الفعالة هي الـbase وPhase 2 وAnalytics Restoration. الخدمة الفعلية كانت `cms-api` و`cms-front`، وقاعدة البيانات `cms-postgres-db`.

- migrations: **18، up to date** قبل وبعد. فحص schema datasource مقابل Prisma schema أعاد `No difference detected`.
- `users.ux_variant` و`member_groups.ux_variant` موجودان بنوع `character varying(10)`، مطابقين للـschema.
- SHA-256 لملف `schema.prisma` في source وصورة API: `0fce0b4bafdbb98489979827a5e7bb17e84c3bbca207c765857527b860665b0a`.
- مراجعة Git أكدت عدم وجود schema أو migration changes بين implementation branch وفرع الإصدار السابق.
- الـCompose overlay يغير صور API والواجهة وrevision labels فقط. مقارنة الإعداد الفعال أكدت ثبات بقية إعدادات الخدمات الثلاث، ومنها البيئة وnetwork والـvolume mounts.

لم أشغّل `migrate reset` أو `db push` أو migrations جديدة أو SQL تعديلية على production. API startup تحققت من migrations ولم تجد pending.

## 3. البناء والاختبارات

| الفحص | النتيجة |
|---|---|
| Frontend `npm run typecheck` | PASS |
| Frontend stabilization checks | PASS — **13 tests** |
| Frontend production client + SSR Docker build | PASS |
| Recharts `3.10.1` و`react-is 19.2.8` ضمن شجرة الاعتماد والبناء | PASS |
| Backend Prisma Client generation | PASS |
| Backend TypeScript check وNest production build | PASS |
| Backend report/journey tests | PASS — **3 suites / 10 tests** |
| Admin Preview authorization/read-only E2E | PASS — **2 tests** على PostgreSQL اختبارية |

الـE2E اتنفذ على قاعدة `cms_test` جديدة بـPostgreSQL 17، داخل network مؤقتة بلا host ports وبيانات صناعية. احتاجت قاعدة الاختبار فقط إضافة عمودي `ux_variant` لتطابق Prisma schema بعد migrations؛ الموارد المؤقتة اتقفلت واتشالت. الاختبارات لم تتصل بالإنتاج.

### مراجعة dependency advisories

`npm audit` أظهر اثنين High في شجرة البناء: `body-parser@2.3.0` غير مباشر ضمن production dependencies، و`vite@8.3.1` ضمن devDependencies. `npm audit --omit=dev` أظهر `body-parser` فقط.

راجعت مسار تشغيل الواجهة: React Router server يركب compression وstatic assets وlogging ثم request handler، ولا يركب `body-parser`/`express.json()` middleware؛ لذلك كود parser المتأثر لا يُستدعى في إعداد التشغيل الحالي. GitHub advisory يصف الخطر عند استخدام parser middleware، ويصلح في `body-parser 2.4.0` أو `1.20.9` ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)). `Vite` موجود في dev dependencies فقط، وصورة التشغيل النهائية تُبنى من `npm ci --omit=dev` ولا تشغل Vite dev server. على هذا الأساس لا يظهر blocker أمني حرج قابل للوصول في release configuration الحالي؛ سجّلت ترقية `body-parser` غير المباشرة كتحديث صيانة لاحق، ولم أغير dependencies خارج نطاق الإصدار.

## 4. النشر وحفظ البيانات

تم بناء الصورتين بالـtags أعلاه، ثم تشغيل:

```bash
docker compose -p cms-back \
  -f /data/cms-back/compose.yml \
  -f /data/cms/compose.phase2-production.yml \
  -f /data/cms/compose.analytics-restoration-production.yml \
  -f /data/cms/compose.analytics-redesign-production.yml \
  up -d --no-deps --no-build --force-recreate --pull never api frontend
```

تمت إعادة إنشاء `api` و`frontend` فقط. PostgreSQL لم تتوقف أو يعاد إنشاؤها، والـreverse proxy والـ`.env` لم يتغيرا.

| العنصر | قبل | بعد |
|---|---|---|
| PostgreSQL container | `4e3bd09df3e0…` | **نفس Container ID**، Healthy |
| Database volume | `cms-back_cms-postgres-data` | نفس الـvolume |
| CV volume | `cms-back_cv-storage` | نفس الـvolume؛ ما زال مركبًا على API |
| API / Frontend | analytics-restoration images | redesign images الجديدة، Healthy، restart count `0` |

Counts قراءة فقط قبل وبعد؛ متطابقة: `users 13`، `applications 46`، `user_cvs 11`، `user_cv_history 11`، `user_journey_states 3`، `side_task_submissions 0`، `application_stage_transitions 47`، `member_groups 2`، `journey_nodes 25`. ملفات CV: **12** قبل وبعد؛ checksum تجميعي للملفات ظل `2c7ed113146cd4c23f00436d7edafb80983719a472acecfde05825728e5b6ed6`.

## 5. التحقق بعد النشر

| الفحص | النتيجة |
|---|---|
| API container وFrontend container | Healthy، restart count `0` |
| PostgreSQL | Healthy، نفس ID والـvolume |
| `http://127.0.0.1:3000/health` | 200 |
| `http://127.0.0.1:8080/`, `/reports`, `/admin/report-preview` | 200 |
| `https://api.nawah-project.com/health` | 200 |
| `https://nawah-project.com/`, `/reports`, `/admin/report-preview` | 200 |
| `/journey/reports` بدون جلسة | 401 كما هو متوقع |
| `/admin/journey/reports/demo?scenario=WEEK1_COMPLETE` بدون جلسة | 401 كما هو متوقع |
| Prisma `migrate status` بعد التشغيل | 18 migrations؛ up to date |
| Prisma schema diff | No difference detected |
| API startup log | `No pending migrations to apply` |

فحصت assets داخل containers ووجدت frontend Admin Preview / report bundle، وBackend reporting bundle الجديدة. الـHTTP 200 يثبت الوصول للمسارات، وليس فحصًا بصريًا.

## 6. اختبار المتصفح والتجربة

لم أفتح Browser أو أسجل دخولًا بحساب. لا توجد screenshots في هذا التقرير. الخادم headless، وBrowser QA ستتم منفصلة عبر Codex Desktop كما طلبت. الموقع جاهز للتجربة الحية على `/reports`، ومعاينة Admin على `/admin/report-preview` تتطلب تسجيل دخول Admin. اختبر حالات DEMO السبع هناك؛ اختبارات الـBackend أثبتت endpoint والحماية، لكن شكل الواجهة لم يُراجع بصريًا بعد.

## 7. Rollback

صور Analytics Restoration السابقة ما زالت موجودة محليًا. للرجوع إلى release السابق من غير لمس قاعدة البيانات أو volumes:

```bash
cd /data/cms-back
docker compose -p cms-back \
  -f /data/cms-back/compose.yml \
  -f /data/cms/compose.phase2-production.yml \
  -f /data/cms/compose.analytics-restoration-production.yml \
  up -d --no-deps --no-build --force-recreate --pull never api frontend
```

لا يوجد schema change يمنع الرجوع. لم أُنشئ backup جديدًا ضمن عملية النشر دي.

## 8. النتيجة

**DEPLOYED — READY FOR LIVE BROWSER QA.** الإصدار الجديد منشور على البيئة الموجودة، على نفس قاعدة البيانات وCV volume. ابدأ الفحص الحي من `/reports`، وافتح Admin Report Preview بعد تسجيل دخول Admin. قرار قبول الشكل responsive/RTL/keyboard يظل مفتوحًا إلى أن يتم فحصه في المتصفح.
