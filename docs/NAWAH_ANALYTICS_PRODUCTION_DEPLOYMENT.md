# نواة — تقرير نشر Performance Analytics على الإنتاج

**التاريخ:** 26 أكتوبر 2026.  
**النتيجة:** **DEPLOYED — READY FOR BROWSER QA**  
**الموقع:** `https://nawah-project.com/reports`

## 1. الإصدار ومصدره

الإنتاج شغال من Compose project اسمه `cms-back`، ومجلد التشغيل `/data/cms-back`. راجعت labels للحاويات؛ ملفات Compose الفعالة وقت النشر كانت:

- `/data/cms-back/compose.yml`
- `/data/cms/compose.phase2-production.yml`
- `/data/cms/compose.analytics-restoration-production.yml` — overlay جديد يغيّر صور التطبيق فقط.

الـCompose كان بيبني من مجلدي release الفعليين، والفرعين نظاف قبل البناء:

| الخدمة | المستودع | الفرع والـcommit المضمّن في الصورة |
|---|---|---|
| Backend | `/data/cms/production-release/cms-back` | `restoration/performance-analytics` — `0ac658cc9bba8da488c47bd8d9c72e6bf904134f` |
| Frontend | `/data/cms/production-release/cms-front` | `restoration/performance-analytics` — `de9847b77b6f7691174206178612b403cdfa00da` |

التغييرات الإدارية السابقة محفوظة في تاريخ الفرع: backend يبدأ من Phase 2 commit `47edf7e` وسلفه `c2ca3ed`؛ frontend يبدأ من `90a2880` المبني بعد دمج `main` في `1ec0442`، وفيه Guided Tour commit `8f97e3f`. استعادة Analytics أضافت العرض والـread model المطلوبين فوق النسخة دي. لم أدمج أو أحذف تحديثات من checkout مختلف.

صور الإنتاج القديمة ما كانش فيها OCI label يثبت Git SHA. Compose يثبت build context، وتوقيت إنشاء الصورتين القديمتين `00:59 UTC` جاء بعد commits الـrelease الأساسية `47edf7e` و`90a2880` في `00:53 UTC`؛ لذلك ربط الصورة القديمة بهذين الـcommits مستنتج من المسار والتوقيت، مش SHA مخزّن داخل الصورة. الـrelease الجديد مربوط بالـcommits المذكورة في الوسم وسجل البناء.

## 2. فحص قاعدة البيانات وPrisma

قبل النشر، نفذت فحوص قراءة فقط على PostgreSQL الإنتاجية `cms`:

- `prisma migrate status`: **18 migrations، up to date**.
- `users.ux_variant` و`member_groups.ux_variant` موجودان كـ`varchar(10) NULL`، مطابقين لـ`String? @db.VarChar(10)` في Prisma.
- `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code`: **No difference detected**.
- SHA-256 لملف `prisma/schema.prisma` في صورة API الحالية والـrelease متطابق.
- فرع الاستعادة لا يغيّر `schema.prisma` أو `prisma/migrations`؛ مفيش migration جديدة مطلوبة.

فرق الـ`ux_variant` اللي ظهر أثناء اختبار قاعدة جديدة كان خاصًا بقاعدة الاختبار: بعد تطبيق الـ18 migration أُضيف العمودان يدويًا إلى قاعدة `cms_test` المؤقتة فقط لتشغيل integration tests. فحص production الفعلي أثبت إن العمودين موجودان بالفعل؛ لم أجرِ أي `ALTER` أو `db push` أو migration على production.

الـAPI image entrypoint يشغّل `prisma migrate deploy` عند startup. اللوج بعد التحديث أكد **No pending migrations to apply**؛ لم تُطبّق أي migration.

## 3. البناء والاختبارات

| الفحص | النتيجة |
|---|---|
| Backend Prisma Client generation وproduction build وTypeScript check | PASS |
| Backend analytics/journey unit tests | PASS — **3 suites / 15 tests** |
| Backend report regression على PostgreSQL مؤقتة `cms_test` | PASS — **4 tests**، تشمل 1007 طلب، late transitions، وقراءة التقرير من غير تغيير progression |
| Admin Preview HTTP E2E على `cms_test` | PASS — **2 tests**: صلاحيات Admin، DEMO/ACTUAL read-only، وعدم تغيير state أو عدد الطلبات |
| Frontend typecheck | PASS |
| Frontend stabilization/SSR tests | PASS — **9 tests** |
| Frontend production client + SSR build | PASS |
| Backend Docker production image build | PASS |
| Frontend Docker production image build | PASS |
| `git diff --check` قبل النشر | PASS |

اختبارات PostgreSQL استخدمت container وشبكة داخلية بلا host ports وبيانات synthetic فقط؛ ما اتصلتش بقاعدة الإنتاج. بناء frontend أظهر **2 high severity advisories** أثناء `npm ci`؛ مفيش dependency أو lockfile اتغير، ودي محتاجة مراجعة منفصلة.

## 4. الصور والتحديث المنفّذ

بنيت صورتين جديدتين بوسوم فريدة مرتبطة بالـcommits:

| الخدمة | الوسم | Image ID |
|---|---|---|
| API | `cms-back-api:nawah-analytics-restoration-20261026-0ac658c` | `sha256:ba9e047efb38d5fb52988b33c64059e861aa31d92bd64967001f52697468cfb5` |
| Frontend | `cms-back-frontend:nawah-analytics-restoration-20261026-de9847b` | `sha256:c60536529f91bb0a8c185941e79f1b221dbc6b247e74be7628c62a38e1f8e347` |

أعدت إنشاء `api` و`frontend` فقط عبر Compose مع `--no-deps --no-build --force-recreate --pull never`. ما عملتش `down`، وما أعدتش إنشاء أو تشغيل خدمة PostgreSQL. إعداد البيئة والـreverse proxy زي ما هم.

صور الرجوع القديمة ما زالت موجودة محليًا:

- `cms-back-api:nawah-phase2-20261026` — `sha256:bb359a8b7d83f876c68c0fea0df7072d9ca07ac324fd4f30f60cb50f10f0b492`
- `cms-back-frontend:nawah-phase2-20261026` — `sha256:c9246903ac714abe28d1f98e0a35e943a9ace55f44504973efc29698ddf7abc2`

## 5. قاعدة البيانات والملفات أثناء النشر

PostgreSQL ظلت على نفس container ID `4e3bd09df3e0fbf30389573b53c8e155f32e471fc326d95bd0ef72d8855f5df3`، وبنفس named volume `cms-back_cms-postgres-data`. خدمة API فضلت موصلة بنفس volume `cms-back_cv-storage` عند `/app/private-storage/cvs`.

مقارنة عدادات قراءة فقط قبل وبعد النشر:

| users | applications | current CV rows | CV history rows | journey states | submissions | transitions | groups | journey nodes | ملفات CV |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 13 | 46 | 11 | 11 | 3 | 0 | 47 | 2 | 25 | 12 |

الأعداد متطابقة قبل وبعد. ما سجلتش دخولًا بحساب أو طلب تقرير مصادق عليه، وما أنشأتش نشاطًا تجريبيًا في production. المقارنة aggregate counts فقط، مش snapshot كاملة لقيم كل الصفوف.

## 6. التحقق بعد النشر

| الفحص | النتيجة |
|---|---|
| `cms-api` بالصورة الجديدة | Healthy، restart count = 0 |
| `cms-front` بالصورة الجديدة | Healthy، restart count = 0 |
| `cms-postgres-db` والحاوية/volume | Healthy، نفس الحاوية والـvolume قبل النشر وبعده |
| `http://127.0.0.1:3000/health` و`https://api.nawah-project.com/health` | HTTP 200 |
| `http://127.0.0.1:8080/` و`https://nawah-project.com/` | HTTP 200 |
| `https://nawah-project.com/reports` | HTTP 200 |
| `/journey/reports` بدون جلسة | HTTP 401، مسار محمي كما هو متوقع |
| `/admin/journey/reports/demo` بدون جلسة | HTTP 401، حماية Admin موجودة |
| Prisma migration status بعد النشر | 18 migrations، up to date |
| Backend/frontend logs آخر 5 دقائق | مفيش match لأخطاء Prisma/migration/schema أو SSR/HTTP 5xx في الفلاتر المحددة |

فحصت ملفات الـbuild داخل الحاويات: frontend asset المنشور يحتوي عنوان Performance Analytics وProgress and Market Response؛ وbackend bundle يحتوي `periodComparisons` و`milestones`.

اختبار API مصادق عليه لقراءة ACTUAL أو DEMO من production ما اتعملش؛ كان هيتطلب جلسة/اعتماد Admin، ومفيش credentials أو session اتقدمت للمهمة. E2E على القاعدة المؤقتة غطت هذه المسارات وسلوك القراءة فقط. ما اتنفذش فحص Browser بصري أو keyboard، ولا screenshots؛ النشر جاهز عشان تعمل ده من Codex Desktop.

## 7. الرجوع والمخاطر

صور التطبيق القديمة موجودة ويمكن الرجوع للكود من غير تغيير قاعدة البيانات باستخدام Compose overlay القديم:

```bash
cd /data/cms-back
docker compose -p cms-back \
  -f /data/cms-back/compose.yml \
  -f /data/cms/compose.phase2-production.yml \
  up -d --no-deps --no-build --force-recreate --pull never api frontend
```

ما اتعملش backup جديد حسب نطاق المهمة. بقاء volumes زي ما هي مش ضمان recovery؛ مفيش off-host backup متحقق منه أو restore drill للإنتاج. ما فيش schema change أو migration تعقّد rollback، لكن يفضل اعتبار النسخة المحلية الحالية فقط غير بديل لنسخة استعادة مستقلة.

## 8. النتيجة

**DEPLOYED — READY FOR BROWSER QA.** النسخة الجديدة شغالة علنًا على الرابط المطلوب. سجل دخولك بالحساب المخصص، وبعدها افتح:

- المستخدم: [https://nawah-project.com/reports](https://nawah-project.com/reports)
- Admin Preview: [https://nawah-project.com/admin/report-preview](https://nawah-project.com/admin/report-preview) — يتطلب حساب Admin.

ده يؤكد نجاح النشر وhealth/API smoke checks، لكنه مش ادعاء إن الشكل أو التفاعل اتراجعوا بصريًا.
