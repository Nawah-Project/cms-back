# Nawah — Regression Map & Analytics Restoration

**تاريخ المراجعة:** 26 أكتوبر 2026.  
**نقطة البداية:** فرع `restoration/performance-analytics`، متفرع من `stabilization/phase-2-production` في المستودعين.  
**حدود العمل:** استعادة تجربة التحليلات على source فقط؛ لا deploy، ولا database production، ولا migrations تدميرية.

## 1. نتيجة الفحص قبل التنفيذ

فحصت حالة Git والفروع وتاريخ الصفحة قبل تعديل source. المستودعان كانا clean على فرع الإصدار، ثم اتعمل فرع محلي مستقل `restoration/performance-analytics` في كل مستودع. لم أعمل reset أو revert.

الـHTML المرجعيان `التقارير وتحليل الأداء _ Nawah Project.html` و`Reports _ Nawah(1).html` غير موجودين في مجلد المرفقات أو مسارات المشروع التي اتفحصت. لذلك المقارنة المرئية المباشرة معهما غير ممكنة؛ مصدر React التاريخي هو المرجع القابل للتحقق هنا.

تاريخ الواجهة يثبت أن النسخة الغنية كانت صفحة React كبيرة واحدة، وليست مجموعة مكونات منفصلة: `adc9eaa` أدخل معمل التحليلات؛ ثم حسّنته commits `0daaa28`, `02ac2b3`, `ed094c2`. في `2da16dd` تقلص `ReportsPage.tsx` بمقدار 2,007 سطر محذوف مقابل 75 سطر مضاف، وأصبح التركيز على weekly cohorts والنتائج المصححة والإقرار بالتقرير النهائي. ده يثبت استبدالًا/تبسيطًا كبيرًا في نفس الصفحة، لكنه لا يثبت وحده سبب قرار المنتج.

النسخة الحالية على نقطة البداية هي `ReportsPage.tsx` بحوالي 631 سطرًا، وتعرض counters وchart يومي بسيطًا وسجلًا؛ صفحة Admin Preview تستخدم نفس مكوّن العرض في read-only context. Backend Phase 2 لديه snapshot متسق، كل سجلات الطلبات بلا pagination limit، نتائج موجبة موثقة، تاريخ انتقالات، نسخ CV وسجل الأنشطة. قبل التعديل كان `getReports()` يستدعي `getOrCreateUserState()`؛ التعديل أزال الكتابة دي وخلى غياب الـstate يظهر كخط أساس فارغ. قواعد progression وunlock نفسها لم تتغير.

## 2. مصفوفة الانحدار والاستعادة

| التجربة الأصلية | المكوّن/المصدر الأصلي | الحالة الحالية قبل التعديل | اعتماد البيانات | طريقة الاستعادة مع الحفاظ على Phase 2 |
|---|---|---|---|---|
| عنوان Performance Analytics واختيار النطاق | `ReportsPage.tsx` التاريخي، commit قبل `2da16dd`؛ نطاق ALL والأسابيع 1–4 | عنوان عام لتقارير الرحلة؛ tabs تشمل الرحلة والتفعيل 0 والأسابيع 1–4، من غير lock ظاهر | `currentWeek`, `currentNodeCode`, `completedNodeCodes`, `finalAvailable` | جعل التحليلات الشاملة هي الافتراضية، وإظهار تقارير 1–4 كاختيارات مستقلة مقفولة حتى شروط Phase 2 المحفوظة؛ التقرير النهائي اختيار منفصل لا يساوي Week 4 |
| Progress and Market Response chart | SVG رئيسي داخل نفس صفحة React التاريخية | SVG يومي واحد لعدد الطلبات أو positive events، مع اختيار مقياس وcheckbox تراكمي | `daily`: تاريخ إنشاء الطلبات وانتقالات فعلية، مع `cvs` و`activities` كنقاط تغيير | إعادة رسم SVG أكبر مع axes/legend/tooltips ونقط تغيير حقيقية؛ تبقى تواريخ الطلبات منفصلة عن تواريخ أحداث الانتقال |
| chart toggles والتغذية المرئية | segmented controls: تراكمي/فترة وحجم/معدل | اختيار select لمقياس واحد وcheckbox تراكمي | بيانات `daily` وحالات التقرير | segmented accessible controls؛ مقاييس الفترة والتراكم تستخدم نفس محور التاريخ ونفس تعريف transition events، مع بديل جدولي |
| ملخص المؤشرات بجانب الرسم | لوحة جانبية ضمن كارت الرسم الأصلي | counters موجودة بقسم مستقل، من غير layout مترابط مع الرسم | `overall` و`weeks`؛ tailored/positive/interviews/assignments/outcomes | تركيب chart وملخص صغير بجانبه على desktop، وترتيب رأسي على mobile؛ positive والنتائج لا تُجمع باعتبارها فئات متنافية |
| توزيع stages والنتائج | donut تاريخي واحد يمزج مراحل وحالات نهائية | visualization غير موجود؛ توجد عدادات متداخلة بالنص | الوضع الحالي `stage` و`outcome`؛ لازم نضيف حصر `currentStages` للـread model، بينما outcomes الحالية معروفة | عرض توزيع المرحلة الحالية منفصلًا عن outcomes المتنافية؛ milestones السابقة كقسم ثالث مستقل، مع denominators وتنبيه نقص history |
| التحويل بين المراحل | counts مشتقة محليًا من المرحلة الحالية وحالة الطلب | positive progression rate مصحح موجود، ولا توجد رؤية تحويل مرئية | حالة الطلب الحالية + `ApplicationStageTransition` | إظهار أعداد reached milestones من evidence المحفوظ (assignment/interview/decision)، لا funnel يدعي احتمالات أو ترتيبًا إذا history ناقصة؛ denominator هو كل الطلبات في scope |
| مقارنة فترات التجهيز/التغييرات | `EquipmentEra`/أعمدة SVG مبنية من CV وuser change logs | لا توجد مقارنة مرئية؛ المتاح تفاصيل activities وCV history في dialogs | upload dates الحقيقية، `USER_CHANGE` المسجل، applications.createdAt/outcome/transitions | بناء فترات ملاحظة بين checkpoints فعلية فقط؛ إظهار طلبات أُنشئت بالفترة ونتائج cohort الحالية as-of snapshot، وأحداث الانتقال الفعلية بفترتها. بلا دعوى أن CV استُخدمت بطلب أو سببت نتيجة |
| خط أساس CV وسجل النسخ | نقطة baseline مصطنعة + CV iteration في الواجهة القديمة | سجل نسخ محفوظة فقط؛ لا baseline افتراضي في التاريخ | `UserCvHistory` الفعلي عبر `cvs` | timeline للنسخ الحقيقية؛ لا إنشاء v1 أو baseline تاريخي لو السجل غير موجود |
| checkpoints على الرسم | pins لأحداث التغيير حسب تاريخ اليوم | لا توجد نقاط تغيير على chart | `cvs.uploadedAt`, الأنشطة الحقيقية وتواريخها، `daily.date` | markers تفاعلية فقط عند تطابق تاريخ فعلي؛ التاريخ المختلط لا ينشئ نقطة نشاط/نتيجة مصطنعة |
| Change and Experiment History | cards/timeline ومودال تغيير في الصفحة القديمة؛ بعض السجلات من `localStorage` وبعضها أرسل كـ`WEEKLY_REVIEW` | نشاط محفوظ في dialog؛ Phase 2 ميّز `USER_CHANGE` عن `WEEKLY_REVIEW` والـlegacy | activities المحفوظة من API والـCV history | timeline يفصل CV uploads، reflections، و`USER_CHANGE`; لا قراءة localStorage ولا تحويل reflection إلى تغيير؛ زر تسجيل التغيير يظل وفق unlock الحالي |
| الإرشاد التحليلي | Diagnosis rules ثابتة بأوصاف bottleneck وأزرار | نصوص عامة evidence-aware؛ لا contextual chart summary | counts الفعلية، response evidence، وunknown history | ملاحظات شرطية وصفية حسب العينة والمراحل والبيانات الناقصة؛ بدون AI أو سببية أو نص يقول إن CV سببت تحسن |
| تقارير الأسابيع | tabs مقفولة حسب review completion في الصفحة التاريخية | كل النطاقات ظاهرة بلا lock | review codes/current week؛ شروط التقرير المحفوظة بالـjourney state | استعادة lock affordance ونص سبب الإتاحة، مع تطبيق predicates Phase 2 نفسها وعدم كشف محتوى أسبوع مستقبلي |
| التقرير النهائي | نقطة/منظور الإكمال الشامل في رحلة التحليلات | final section محفوظ أسفل الصفحة ويظهر عند `finalAvailable || completed`؛ whole journey منفصل بالفعل عن Week 4 | `finalAvailable`, `completed`, `overall` | الحفاظ على زر الإقرار الحالي، وإضافة selector مستقل للتقرير النهائي؛ لا عرض زر الإكمال في Admin Preview |
| empty states وprogressive unlocking | baseline chart وlocked week popovers وعينة أولية | counters فارغة/نصوص عامة؛ لا lock feedback؛ الصفحة تعمل قبل reports | عدم وجود applications/CVs، state/unlock fields | chart empty/low-data واضح، لا fixtures في بيانات العضو، وتظل التحليلات الشاملة ظاهرة حتى لو التقارير الأسبوعية مقفولة |

## 3. قرارات صحة البيانات

- counts الكاملة تأتي من `/journey/reports` snapshot كاملة ومتسقة؛ لن يرجع client-side limit مثل `1000`.
- المرحلة الحالية (`stage`) لا تساوي التاريخ (`transitions`) ولا النتيجة النهائية (`outcome`). الواجهة تعرضهم كمفاهيم منفصلة.
- positive progression يظل تعريف Phase 2، والرفض وحده لا يحسب تقدمًا إيجابيًا. NO_RESPONSE وWITHDRAWN لا يدخلان positive.
- transition events تتجمع بتاريخ `changedAt` الفعلي؛ لا نؤلف تاريخًا لأي history مفقود.
- المقارنة حول CV/change هي وصف لفترات التقويم وسجلات مستخدم فعلية؛ لا توجد علاقة محفوظة بين CV بعينها وapplication بعينها.
- قراءة تقرير العضو يجب ألا تهيئ `UserJourneyState` أو تغيّره. التقدم والـunlock محكومان بمساراتهم المعتادة خارج reports read.
- Admin Report Preview يبقى منفصلًا ومحميًا ويستخدم Report presentation للقراءة فقط؛ خصوصية المحتوى الفعلية تظل محكومة بالـendpoint الإداري.

## 4. التحقق المرئي

لا تتوفر Browser automation في جلسة التنفيذ، وملفات HTML المرجعية غير موجودة في المسارات المتاحة. لن أدرج screenshots أو أدعي مراجعة مرئية. ملف [NAWAH_ANALYTICS_VISUAL_ACCEPTANCE.md](/data/cms/NAWAH_ANALYTICS_VISUAL_ACCEPTANCE.md) يحتوي checklist قابلة للتطبيق يدويًا أو في جلسة Browser لاحقة.

## 5. ما اتنفذ

- رجعت `/reports` إلى **Performance Analytics** شامل كالشاشة الافتراضية، مع تقارير Week 1–4 منفصلة ومقفولة لحد شروط الرحلة الموجودة، وFinal Report اختيار مستقل عن Week 4.
- أضفت `PerformanceAnalytics.tsx`: SVG chart بمحور تاريخ حقيقي، عرض period/cumulative، خطوط منفصلة لطلبات التسجيل وانتقالات التقدم الإيجابي، نقاط تغيير فعلية من CV و`USER_CHANGE`، native tooltips وبديل جدولي accessible. ملخص الأرقام بجانب الرسم على desktop ويتحول لترتيب رأسي على mobile.
- أضفت stage bars للمرحلة الحالية وoutcome bars للنتيجة الحالية وmilestone bars للتاريخ الذي وصل له الطلب. المرحلة الحالية والنتيجة النهائية والتاريخ لا تتجمع في نسبة واحدة؛ denominators والنسب ظاهرة.
- أضفت مقارنة بصرية لفترات الطلبات بين CV uploads والتغييرات اليدوية المحفوظة، وتعرض عدد الطلبات والنتائج الحالية حتى وقت اللقطة ومعدلها حين يتوفر مقام. الملاحظة توضح إن متابعة الردود ليست متساوية وإن النتيجة لا تثبت استخدام CV أو علاقة سببية.
- أضفت timeline من السجلات الفعلية: CV uploads و`USER_CHANGE` وweekly reflections وLinkedIn posts وoutreach. كل نوع ظاهر بشكل مستقل؛ لا localStorage ولا سجل تغيير أو baseline متخيل.
- أعدت بناء الإرشاد كسياق وصفي يعتمد على حجم العينة والتقدم وhistory الناقصة، من غير AI مدفوع أو تشخيص سببي.
- `ReportPreviewPage` فضل منفصلًا. العرض المشترك يأخذ DEMO وACTUAL من الـAdmin context، بلا أفعال كتابة في preview. server-side role checks والتنقيح الحالي للبيانات الخاصة لم يتغيروا.
- أضفت للـread model مجاميع إضافية للـcurrent stages والـoutcomes والـhistorical milestones، وفترات comparison مشتقة داخل نفس Repeatable Read snapshot. لا application records جديدة تُرسل للواجهة، ولا migrations أو dependencies جديدة.
- التغيير في `JourneyEngineService` محصور في accessor التقرير ومنع تهيئة state في GET؛ progression logic وcurriculum وقواعد unlock لم تتغير.

### الملفات المعدلة

**Frontend:** `src/app/features/reports/pages/ReportsPage.tsx`, `src/app/features/reports/pages/PerformanceAnalytics.tsx`, `scripts/stabilization-checks.mjs`.  
**Backend:** `src/journey-engine/reporting.util.ts`, `src/journey-engine/journey-engine.service.ts`, `src/journey-engine/reporting.analytics-restoration.spec.ts`, `test/admin-report-preview.e2e-spec.ts`.  
التقريران موجودان في جذر `/data/cms` ونسخة Git منهما تحت `docs/` في كل مستودع.

## 6. اختيارات وحدود البيانات

- كل مراحل application الحالية معروفة من Prisma enum؛ outcomes الحالية متنافية. historical interview/assignment/decision milestones قد تتداخل وتستند على transition history المتاح.
- تعريف `positive` وunknown interview وlate transition يظل Phase 2. البيانات التاريخية الناقصة لا تتحول إلى «مفيش مقابلة» أو تاريخ مخترع.
- `USER_CHANGE` لا يحفظ category منفصلة في schema الحالي؛ لذلك يظهر تغييرًا يدويًا عامًا. LinkedIn posts وoutreach يظهروا كتاريخ نشاط، لكنهم لا ينشئوا comparison checkpoint لأنهم ليسوا سجل تغيير مهني مؤكد.
- لا يوجد رابط محفوظ بين application ونسخة CV المستخدمة. المقارنة تجمع application cohort حسب createdAt حول checkpoint، وتعرض outcome الحالية as-of snapshot. لا تقيس causal effect أو response time موحد.
- بعض سجلات التغيير القديمة كانت localStorage أو اتسجلت تاريخيًا كـ`WEEKLY_REVIEW`؛ لن أسترجعها كتغيير أو أصنفها تخمينًا. baseline لا يظهر إلا من أول checkpoint فعلي.
- ملفات HTML المرجعية مش متاحة، فالمقارنة مع النسخة الغنية تمت من React history فقط. الملفات التاريخية السابقة احتوت حسابات محلية وسجل localStorage؛ رجعت بنية العرض واحتفظت بتعريفات البيانات المصححة.

## 7. الاختبارات والتحقق

كل الاختبارات اتنفذت في حاويات تحقق مؤقتة. Backend integration استخدم PostgreSQL 17 جديدة وnetwork داخلي و`cms_test` صناعية بلا host ports؛ بعد الـ18 migration ظهر فرق قديم: Prisma يتوقع `users.ux_variant` و`member_groups.ux_variant` لكن migration baseline لا تنشئهما. للتكامل فقط أُضيف العمودان يدويًا إلى **قاعدة الاختبار المؤقتة**؛ ما اتضافتش migration في هذا التغيير ولم يتم الاتصال بقاعدة production.

| الفحص | النتيجة |
|---|---|
| Frontend `npm run typecheck` | PASS |
| Frontend `node --test scripts/stabilization-checks.mjs` | PASS — **9 tests**: empty/populated analytics، locks، weekly/final separation، Admin read-only، existing auth/cache checks |
| Frontend `npm run build` | PASS — client وSSR |
| Backend `npm run prisma:generate` | PASS |
| Backend `npm run build` | PASS |
| Backend focused Jest: analytics restoration + demo/read model + journey service specs | PASS — **3 suites / 15 tests** |
| Backend Admin report preview HTTP E2E على PostgreSQL الاختبار | PASS — **2 tests**: Admin access/DEMO/ACTUAL، member state unchanged، empty service read بلا إنشاء state |
| Backend `node --test test/stabilization.stage-b.cjs` | PASS — **4 report/journey regression tests**، منها 1007 application وlate transitions |
| `git diff --check` للمستودعين | PASS |

Browser automation غير متاحة، فمفيش screenshots أو ادعاء بإن RTL/responsive اتفحصوا بصريًا. [Visual Acceptance](</data/cms/NAWAH_ANALYTICS_VISUAL_ACCEPTANCE.md>) لسه محتاج تنفيذ يدوي في Browser على المقاسات واللغتين وحالات البيانات الموضحة.

## 8. حالة الإصدار

التنفيذ على `restoration/performance-analytics` محليًا في مستودعي `/data/cms/production-release/cms-front` و`/data/cms/production-release/cms-back`. **مفيش deploy، push، تعديل production DB، أو migration** ضمن المهمة.

الحالة: **جاهز لمراجعة الكود على الفرع، وغير موصى بنشره قبل visual acceptance ومراجعة schema drift.** الـbuild والاختبارات تثبتان توافق source والسلوك المغطى، لكن لا تستبدلان فحص المتصفح. لازم deploy لاحق يدمج الـbackend والـfrontend المتوافقين معًا بعد مراجعة مستقلة؛ لا يتم ضمن هذا العمل.
