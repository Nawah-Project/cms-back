# نواة — تنفيذ إعادة تصميم Performance Analytics والتقارير الأسبوعية

**الحالة:** التنفيذ والاختبارات المركزة اكتملوا على فرعي عمل قبل الإطلاق؛ تفاصيل النشر الحالي في [تقرير الإصدار](/data/cms/NAWAH_ANALYTICS_REDESIGN_PRODUCTION_RELEASE.md).
**Frontend:** `/data/cms/production-release/cms-front` — `feature/analytics-redesign`
**Backend:** `/data/cms/production-release/cms-back` — `feature/analytics-redesign`
**Commits:** Frontend `b9ad1ff`؛ Backend `0a8e3f9`؛ تقارير التنفيذ والقبول في commit التوثيق بكل مستودع.
**النطاق:** تجربة التحليلات وتقارير الأسابيع والتقرير النهائي ومعاينة Admin؛ بلا تغيير في المنهج أو قاعدة الإنتاج.

## 1. تشخيص التصميم قبل التعديل

الواجهة القديمة كانت تعرض رسم SVG مكتوبًا يدويًا، فحالة طلب واحدة كانت تترك مساحة رسم كبيرة شبه فارغة. كمان الصفحة كانت مكدسة بأقسام وبطاقات متشابهة، ومقارنة فترات التغيير كانت واسعة حتى من غير بيانات، والتقارير الأسبوعية ظهرت أساسًا كاختيارات مقفولة بدل ملخص واضح للي حصل في كل مرحلة.

فصلت التجربة إلى تحليلات مستمرة، وتقارير أسبوعية، وتقرير نهائي؛ كل واحدة لها غرض مختلف. فضلت أتعامل مع نقص التاريخ كـunknown بدل استنتاج ماضٍ غير مسجل.

## 2. ترتيب المعلومات النهائي

### Performance Analytics

1. عنوان مختصر وتاريخ اللقطة.
2. أربع مؤشرات أساسية: الطلبات المسجلة، التقدم الإيجابي، المقابلات، والمهام/الأنشطة المسجلة بحسب البيانات المتاحة.
3. رسم النشاط وتغير المراحل مع اختيار period أو cumulative وإظهار/إخفاء السلاسل.
4. توزيع المرحلة الحالية منفصلًا عن النتيجة الحالية وعن milestones التي وصلت لها الطلبات تاريخيًا.
5. مقارنة مجموعات الطلبات حول نقاط CV أو `USER_CHANGE` المسجلة فعلًا.
6. Timeline للـCV والتغييرات اليدوية والانعكاسات الأسبوعية والمنشورات والتواصل، مع سجل منهجية قابل للفتح.

الحالات الصغيرة لها عرض compact: لا يتم تكبير chart لطلب واحد، وحالة الصفر لا تعرض metric أو trend مخترعًا. المقارنة لا تحجز مساحة فارغة عند عدم وجود checkpoints.

### Weekly Reports وFinal Report

التقارير الأسبوعية تعرض milestones الحقيقية وعلامة إكمال كل واحدة، النشاط المحفوظ في `journeyWeek` نفسه، الرسم الخاص بأحداث ذلك الأسبوع، الانعكاس المكتوب كما حفظه المستخدم، وما يمكن كشفه عن المرحلة التالية. الأسابيع المستقبلية تظل مقفولة طبقًا لقواعد Phase 2.

التقرير النهائي اختيار منفصل يدمج الرحلة كلها، ويعرض الانعكاسات والمهام والنقاط المسجلة. يظل زر إكمال الرحلة للمستخدم العادي فقط؛ معاينة Admin للقراءة فقط.

## 3. مكتبة الرسم وسلامة SSR

استخدمت **Recharts 3.10.1** مع `react-is 19.2.8` بدل الاستمرار في بناء chart engine يدويًا. Recharts متوافق مع React 19 في dependency tree الحالي ويعطي `ComposedChart` و`ResponsiveContainer` وtooltips وaxes والـlegend.

المكوّن لا يقرأ `window` أو `ResizeObserver` أثناء SSR. الرسم يظهر بعد mount داخل مساحة ذات ارتفاع محدد، مع بديل جدولي يمكن الوصول إليه. واجهة اختيار series وperiod قابلة للوحة المفاتيح، ونقطة التاريخ المختارة يمكن تغييرها دون الاعتماد على hover فقط.

## 4. الملفات والتغييرات

### Frontend

- `src/app/features/reports/pages/PerformanceAnalytics.tsx`: استبدال لوحة التحليلات بهرمية أكثر كثافة، ورسوم توزيع pipeline/outcomes/milestones، ومقارنة periods، وtimeline، وتفسير وصفي مع empty/low-data states.
- `src/app/features/reports/pages/ActivityResponseChart.tsx`: رسم Recharts تفاعلي، legend/controls، tooltip، ونظرة جدولية.
- `src/app/features/reports/pages/analytics-model.ts`: تجميع UTC date bins؛ يحافظ على counts عند الانتقال من day إلى week/month، ويدعم period وcumulative دون إنشاء بيانات.
- `src/app/features/reports/pages/ReportsPage.tsx`: فصل analytics عن weekly وعن final، مع إبقاء unlocks وإكمال Final Report وكتابة التغيير المهني في المسار المعتاد فقط.
- `src/app/features/admin/AdminReportPreviewPage.tsx` و`src/app/features/admin/api/adminApi.ts`: اختيار حالات DEMO الجديدة وإرسال scenario ضمن query؛ كل حالة تظل موسومة DEMO.
- `scripts/stabilization-checks.mjs`: اختبارات transformations وempty/one record والقفل والتقرير الأسبوعي/النهائي ومعاينة Admin.
- `package.json` و`package-lock.json`: إضافة Recharts وpeer helper فقط.

### Backend

- `src/journey-engine/reporting.util.ts`: read model يضيف `weeklyDaily`, `weeklyStages`, و`readGuidance`. البيانات تظل مجمعة داخل لقطة التقرير، وعناوين الـjourney تأتي من العقد المحفوظة.
- `src/journey-engine/journey-engine.service.ts`: قراءة عقد الرحلة ضمن snapshot الـRepeatable Read الحالية، وبناء DEMO من fixtures في الذاكرة بلا Prisma writes.
- `src/journey-engine/journey-engine.controller.ts`: Admin-only demo endpoint يقبل `scenario` معروفًا ويرفض غير المعروف بـ400.
- `src/journey-engine/reporting.util.spec.ts`, `src/journey-engine/admin-report-preview.spec.ts`, و`test/admin-report-preview.e2e-spec.ts`: تغطية DTO/المقاييس/صلاحيات Admin والسلوك read-only.

لا تعديل في Prisma schema أو migrations. الـAPI العادية ما زالت تقيد actual reports بمالك الحساب، ومعاينة ACTUAL تستخدم Admin guard الموجود على الخادم.

## 5. تعريف المقاييس وصحة البيانات

- `journeyWeek` المحفوظ هو أساس إسناد الطلب لتقرير الأسبوع؛ ما استنتجتش أسبوعًا من التاريخ.
- الطلبات المسجلة تتجمع حسب `createdAt`. أحداث التقدم الإيجابي المعروضة زمنيًا تتجمع على `changedAt` الحقيقي لانتقالات assignment/interview/decision أو قبول محفوظ. الحدث المتأخر يظل داخل cohort الأسبوع الأصلي مع ظهور يوم الانتقال الفعلي منفصلًا.
- **المرحلة الحالية** و**النتيجة الحالية** و**الميلستون التاريخي** ثلاث معلومات مختلفة؛ ما بتتجمعش في funnel واحد يوحي باحتمالات تحويل.
- تعريف التقدم الإيجابي من Phase 2 كما هو؛ `NO_RESPONSE` و`WITHDRAWN` لا يدخلان positive. غياب transition history لا يتحول إلى نفي مؤكد لمقابلة؛ يظهر ضمن evidence غير المعروف.
- `cvs` و`USER_CHANGE` هما checkpoints فقط إذا كان السجل موجودًا. نتائج الطلبات في مقارنة الفترة هي النتيجة الحالية وقت اللقطة، ومش دليل إن CV محددة استخدمت في طلب أو إنها سببت النتيجة.
- انعكاس `WEEKLY_REVIEW` لا يتحول إلى تغيير مهني. سجلات التاريخ القديم غير المصنفة تظهر بشكل محايد.
- `tasks` لا تحمل journey-week relationship؛ لذلك لا أوزعها على أسبوع تخمينًا.

## 6. حالات DEMO

الـfixtures حتمية ومتوافقة مع read model، وتُبنى في الذاكرة. السيناريوهات المتاحة في Admin preview:

| السيناريو | الغرض |
|---|---|
| `EMPTY` | لا طلبات ولا CV |
| `ONE` | طلب واحد وCV v1؛ اختبار عرض أول تسجيل |
| `EARLY` | خمسة طلبات بمراحل مختلطة مع تاريخ محدود |
| `WEEK1_COMPLETE` | انعكاس وreview للأسبوع الأول، مع تقارير لاحقة غير متاحة بعد |
| `WEEK3_COMPLETE` | أسابيع 1–3 مكتملة بأنشطة مختلفة، وWeek 4 قبل الإكمال النهائي |
| `POPULATED` | 30 طلبًا، حالات ونتائج مختلفة، نسختا CV، تغييرات وانعكاسات متعددة |
| `COMPLETED` | رحلة مكتملة وFinal Report متاح |

الـDEMO endpoint لا يقرأ أو يكتب بيانات نشاط لأعضاء حقيقيين. Actual preview يقرأ المستخدم المختار فقط بعد تحقق Admin في الـBackend.

## 7. الاختبارات ونتائج البناء

النتائج الحالية بعد إضافة سيناريوهات الأسبوع:

| الفحص | النتيجة |
|---|---|
| Backend reporting + journey unit suites | **PASS — 3 suites / 10 tests** |
| Admin Preview HTTP E2E على PostgreSQL اختبار معزولة | **PASS — 2 tests**، وتشمل الحالات السبعة، Admin/member authorization، read-only state، وعضو بلا journey state |
| Backend Prisma Client generation + Nest production build | **PASS** |
| Frontend `npm run typecheck` | **PASS** |
| Frontend `node --test scripts/stabilization-checks.mjs` | **PASS — 13 tests** |
| Frontend production client + SSR build | **PASS** |
| `git diff --check` | نتيجة نهائية مسجلة بعد التجهيز للـcommits في acceptance report |

الـE2E استخدم PostgreSQL 17 مؤقتة `cms_test` على Docker network داخلية بلا host ports. بعد migrations الـ18، قاعدة الاختبار احتاجت إضافة `ux_variant` إلى `users` و`member_groups` يدويًا حتى تطابق Prisma schema الحالية؛ ده فرق baseline معروف في قاعدة جديدة وتم داخل قاعدة الاختبار فقط. ما فيش اتصال أو كتابة على production DB. اتقفلت موارد الاختبار بعد استكمال الاختبارات.

## 8. قيود متبقية والاستعداد للنشر

- لم تتوفر Browser automation في الجلسة؛ لم ألتقط screenshots ولم أراجع بصريًا 390×844 أو 1440×900 أو RTL/LTR أو light/dark. Acceptance report يسجل ذلك كـ**Not verified**، وليس Pass.
- تاريخ البداية/النهاية الدقيقة لكل أسبوع قديم غير مخزن لكل المستخدمين. الواجهة تعرض مدى الأحداث المرصودة، ولا تخترع حدودًا تاريخية. بداية الأسبوع الحالي فقط تستخدم القيمة المحفوظة.
- لم أجرِ benchmark كبيرًا؛ التجميع الحالي مناسب لمرحلة MVP الصغيرة كما في Phase 2.
- ظهر في تثبيت frontend عدد **2 high severity advisories**. لم أعمل audit fix أو تغييرات dependency غير مطلوبة؛ راجع advisories قبل الإصدار.

وقت كتابة الجزء ده كان الفرعان جاهزين لمراجعة الكود وVisual QA ولم يكونا منشورين. بعد ذلك تم نشرهما معًا على البيئة الموجودة. لا migration مطلوبة؛ الـBrowser visual acceptance ما زالت مطلوبة بعد النشر.
