# Nawah — Phase 2A: Journey stabilization

**النطاق:** `/data/cms/cms-back` و`/data/cms/cms-front` على `stabilization/phase-2`. النسخ المنفصلة `/data/cms-back` و`/data/cms-front` خارج الشغل، بما فيها تعديل guided tour الموجود هناك. Phase1 اتثبتت أولًا في commit `a6b41fd`.

## التغييرات المنفذة

- Server يتحقق من current active node، activity type، week eligibility، الحقول المطلوبة، وownership لأي application reference. Weekly reflection لازم تكون فعلية وغير فارغة؛ code مستقبلية وCV-change JSON مش مدخل بديل لتقييم الأسبوع.
- اتشال دمج الطلبات المبني على 10 ثوانٍ. SHA-256 request fingerprint للـnormalized payload مع unique `(userId, requestKey)` يحفظ distinct activities ويدعم identical/concurrent retries. Replay لطلب محفوظ لا يزود counters، حتى لو الطلب الأصلي نقل المستخدم للمحطة التالية. Existing rows تفضل كما هي وrequestKey فيها null؛ مفيش حذف/دمج لتاريخ قديم.
- CV upload ما بيعملش SideTaskSubmission. Actual file hash يمنع إصدار CV جديد لمجرد retry لنفس المحتوى؛ version التالية تراعي actual history وأرقام legacy الحالية. الملفات التاريخية محفوظة، والمراجعة الأسبوعية بتتسلم صراحةً. Legacy structured change records تفضل محفوظة لكن مش weekly-reflection completion.
- Groups تفتح بعد Task0؛ preassigned membership وحدها مش activation. Professional tasks تتفتح في Week3 أو بعدها **بعد قراءة دليل إدارة الوقت على السيرفر**؛ نفس الشرط في guard/navigation/page. Guidance visibility/access/read تتقيد بالـunlocked codes والـaudience.
- `readInsightCodes` تحفظ قراءة catalog fallback على السيرفر حتى لو مفيش DB article؛ قراءات FeedbackRead القديمة المصرح بها بتتنسخ إلى الحقل الجديد أثناء migration. UI ما تعرضش reading success قبل حفظها؛ failed save يسمح بإعادة المحاولة. أحدث authorized DB article لنفس code هو اللي يتعلم مقروء.
- Application mutation events تنتظر commit قبل emission؛ evaluations متسلسلة داخل API instance عشان mutation أثناء evaluation ما تتفقدش. No distributed infrastructure.
- Future weeks ما تعرضش مواعيد نهائية محسوبة كأن كل أسبوع بدأ بالضبط بعد7 أيام؛ الرسالة مرتبطة بإتمام الأسبوع السابق. Same-week persisted time gate كما هو، بدون deadline جديدة.

## سياسة Table View

كان فيه تعارض بين `10 total` في frontend policy وبين seed وصف W1_M1 والـengine flag. اتثبتت السياسة على **إكمال W1_M1 / server canUseTableView** لأنها شرط الـjourney المعرّف للمهمة؛ numeric target نفسها ما اتغيرتش. Legacy server flags محفوظة للتوافق. التفسير المنافس «10 إجمالي» موثق هنا بدل تغييره في الخفاء؛ مش موجود دليل بيطلب تعديل quota الخمس الأولانية أو target W1_M1.

## Schema وdeployment implications

تغييرات additive فقط:

1. `20261026090000_journey_stabilization`: nullable UserCv.contentHash، nullable SideTaskSubmission.requestKey مع unique index، UserJourneyState.readInsightCodes مع safe reading backfill، وSideTaskType.USER_CHANGE للـprofessional change logs المنفصلة عن weekly reflection.
2. `20261026091000_assignment_stage`: إضافة enum value ASSIGNMENT الناقصة من SQL migrations، رغم وجودها أصلًا في schema والـapplication code. اختبار actual DB كشف إن query interview-guidance كانت تفشل على قاعدة جديدة بسببها.

كل migrations اتنفذت على PostgreSQL صناعية فقط. لا destructive SQL أو record cleanup، ولا إعادة seed overwrite. لازم migrations تتطبق قبل تشغيل backend الجديدة؛ deploy نفسه لم يتم.

كمان اتصلح build reliability: Nest كان يمسح dist قبل incremental TypeScript build، فيقدر build متكرر يرجع0 من غير dist/main.js. `tsconfig.build.json` بقى incremental:false؛ اتجرب build مرتين متتاليتين مع التحقق من artifact.

## الملفات

Backend: schema ومجلدا migration أعلاه؛ journey engine service/controller/listener + `journey-rules.ts`؛ application/feedback/profile services؛ members activation guard؛ tasks service/controller/module + `tasks-access.guard.ts`؛ fixture الـjourney؛ `test/stabilization.stage-a.cjs`؛ `tsconfig.build.json`.

Frontend: journey API/types/policies/celebrations/map؛ GuidancePage/GuidanceReadingModal؛ ProfessionalDevelopmentNav وTasksPage. مفيش تعديل في logo/colors/layout أو first-application tour.

## Validation ونتائج التنفيذ

بيئة Node24 cached containers؛ internal test network وقواعد cms_test منفصلة، ببيانات وحسابات وCVs صناعية. مفيش production access.

- `npm run build` backend + consecutive rebuild/artifact: PASS.
- `node --test test/stabilization.stage-a.cjs`: **7/7 PASS**؛ future/empty/wrong-type، ownership، distinct/identical/concurrent retries، CV/review separation، guidance/tasks persistence، committed events/activation، fast/delayed return.
- Journey/Phase1 units: **15/15 PASS**.
- Phase1 actual-DB initialization tests: **3/3 PASS** على DB جديدة مع migrations الحالية.
- `python3 scripts/backup/test_backup.py`: **8/8 PASS**؛ actual isolated restore وsource invariance.
- Frontend production build: PASS. Full frontend typecheck لسه فيه نفس13 diagnostics القديمة في admin/i18n من baseline؛ مفيش diagnostic جديدة من StageA، وإصلاحهم ضمن StageC.

Logs مؤقتة: `/tmp/nawah-phase2-nsuu1c_i/`. Existing quotas والـ25 node defaults محفوظين، وPhase1 destructive cleanup مش رجعت.

## حدود ومخاطر متبقية

- Serialization in-process؛ pilot يفترض API instance واحدة كما في architecture الحالية.
- Idempotency تعتمد exact normalized action داخل node؛ محتوى مختلف يمثل activity مختلفة. Existing historical duplicates لا يتم إصلاحها أو حذفها.
- USER_CHANGE/report UI هيتوصلوا في StageB؛ المرحلة دي لا تدّعي إصلاح التقارير أو FINAL_REPORT.
- Full browser visual verification مش متاحة حتى الآن؛ API/DB tests هي الدليل هنا، مع فحص الواجهة النهائي في StageC.
- الـreading contract بيدعم catalog reading، لكنه مش دليل إن المستخدم فهم المحتوى أو نفّذ AI prompt خارجيًا.
