# نواة — جاهزية إطلاق الـMVP بعد Phase 2

**التاريخ:** 26 أكتوبر 2026 بتوقيت القاهرة. التنفيذ المحلي في `/data/cms/cms-back` و`/data/cms/cms-front` على `stabilization/phase-2`. مفيش deploy أو production data access.

## 1. Executive summary

مسار التسجيل والإكمال والرحلة والتقارير اشتغل في اختبارات HTTP على التطبيق الكامل وPostgreSQL معزولة. انتهت مشاكل حذف startup وseed overwrite من Phase1، واتصلحت validation/idempotency/CV/review/unlocks في A، والمقاييس والإكمال النهائي في B، والـreadiness والخصوصية والـUI contracts/checks في C.

البناء وفحوص الأنواع والاختبارات العامة بقوا ناجحين. لسه مطلوب قبل المستخدمين: فحص متصفح فعلي بالمصفوفة المحددة، وتجربة SMTP على الهدف المقصود، ونسخة consistent/off-host وrestore drill بإشراف operator. نجاح synthetic tests مش إثبات على حالة deployment أو backups حالية لم يتم قراءتها.

## 2. Journey completion

**أيوه، مثبت آليًا:** مستخدم صناعي سجّل وتحقق وأكمل profile ورفع PDF ثم عبر الـ25 node بالـquotas الأصلية؛ سجل applications/tailoring/posts/outreach و3 weekly reflections، قرأ الإرشاد وفتح tasks في التوقيت الصحيح، ثم قرأ ملخص الرحلة وأكد FINAL_REPORT. التكرار ما زوّدش marker، وlogout/login حافظ على completedNodeCodes.

Groups بعد Task0؛ Table View بعد W1_M1 حسب seed/spec المحفوظة، والـlegacy flag محفوظة؛ Professional tasks بعد Week3 + قراءة Time Management المحفوظة. التحكم من API وUI. upload CV ما يقفلش weekly review، والنسخ الفعلية مبنية على history محفوظة وfile content hash. Valid old data ما بتتمسحش عند startup.

A أضافت migration للـreadInsightCodes/requestKey/CV hash/USER_CHANGE، وmigration إصلاح enum ASSIGNMENT المفقودة من SQL رغم وجودها في schema/code. الاتنين additive واتطبقوا على DB اختبار فقط. مفيش quota أو curriculum change.

## 3. Reports

Weekly cohorts وactivation والرحلة بالكامل متاحين من `/journey/reports`، بتجميع كل records المملوكة في snapshot متسقة. اختبار 1007 طلب أثبت عدم اقتطاع الإجماليات. Positive/interview/assignment metrics مشتركة بين journey والتقرير؛ NO_RESPONSE وWITHDRAWN مستبعدين من positive. المقابلات السابقة تستخدم transitions؛ نقص الأدلة ظاهر unknown. الرفض وحده مش positive.

الرسم daily events بتاريخ الانتقال الحقيقي مستقل عن cohort week/current outcome. Late replies تفضل منسوبة لمجموعة طلبها، وتاريخ event نفسه منفصل. CV versions من history الفعلية؛ reflections وmanual changes منفصلين. مفيش ادعاء إن تغيير CV سبب زيادة الاستجابة ولا إنها استخدمت في طلب بعينه. Small/no data ليها وصف محايد. Final report كله مختلف عن week4، وadmin يقرأ marker الإكمال الفعلية.

Milestones غير المرتبطة بأسبوع محفوظ تتعرض في سجل عام بدل أسبوع تخميني. التجميع بيقرأ minimal fields في ذاكرة الباك؛ مناسب لحجم pilot صغير، مش benchmark لملايين السجلات.

## 4. UX/UI

اتصلحت loading/error/retry للرحلة والإرشاد والتقرير والمهام، conditional hooks، ConfirmDialog وباقي admin props، وترجمة واجهة الإرشاد والـreader والتقارير. controls الأساسية ليها keyboard semantics/focus handling، وpicker يقبل PDF. email preference الوهمية اتشالت مع توضيح الحالة الفعلية. قراءة التنبيه لا تتأكد محليًا قبل API، وفشل logout يظهر إنهاء الجلسة غير المؤكد مع retry.

**Browser verification لسه ما حصلتش.** مفيش browser tool/executable متاح؛ لا screenshots ولا ادعاء إن responsive أو keyboard behavior اتراجع بصريًا. [Manual QA checklist](/data/cms/NAWAH_PHASE_2_MANUAL_QA.md) إلزامية قبل الدعوة، على mobile390×844 وdesktop1440×900 بالعربي والإنجليزي. محتوى المقالات التحريري يفضل بلغته الأصلية، مع locale للـUI.

## 5. Security and data integrity

- API readiness بتشترط verified email + profile/CV للبرنامج، مع إبقاء onboarding/recovery متاحة. SMTP failure ما يفعّلش الحساب تلقائيًا ولا يضيع الوصول لإعادة الإرسال. Missing SMTP في production يمنع التحقق لحد تهيئتها، بدل تجاوز التحقق.
- تقدم الزملاء داخل نفس المجموعة ظاهر؛ تفاصيل employer/job/URL الخاصة مخفية إلا لصاحبها أو بالمشاركة الصريحة. Permission لإعادة استخدام فرصة مش بيتوسع تلقائيًا. CV/portfolio يفضلوا وفق سياسة نفس المجموعة الحالية، وcross-group CV/detail مرفوضين. خليك على default defer-group-assignment؛ legacy `ASSIGN_GROUP_ON_REGISTER=true` مش إعداد الـpilot المقصود.
- تغيير الحساب يمسح private cache ويلغي requests ويعيد mount الشاشات؛ late A response ما يكتبش فوق B. اتغطى باختبار QueryClient فعلي، ومعه manual UI scenario لسه مطلوب.
- OTP الجديدة مش مخزّنة في body/subject/log، وadmin responses بتحجب القديمة؛ retry OTP قديمة مرفوض. Historical DB/backup contents لم يتم حذفها أو تنظيفها؛ operator يحدد access/retention/redaction procedure لو مطلوبة، من غير blanket data cleanup.
- Phase1 preservation وbackup/restore لسه ناجحين. Source fixes لا تسترجع submissions/configurations اللي سبق فقدها، ولا تعيد بناء history تخمينًا.

## 6. Tests

Node24.21.0 وPostgreSQL17، cached dependencies بلا install، source copies وdatabases صناعية بلا host ports. Commands داخل النسخ المؤقتة إلا backup script. AppModule HTTP tests استخدمت SMTP/DNS boundaries صناعية؛ لم يتم إرسال بريد خارجي.

| الأمر | آخر نتيجة مقبولة |
|---|---|
| Backend `npm run prisma:generate && npm run build` | PASS |
| Backend `./node_modules/.bin/tsc --noEmit --incremental false` | PASS |
| `./node_modules/.bin/tsc -p tsconfig.stabilization-check.json`؛ config مؤقت يشمل src + test، rootDir `.` | PASS |
| `npm test -- --runInBand` | **107 passed، 20 suites** |
| `npm run test:e2e` | **46 passed، 7 suites** |
| `node --test test/stabilization.stage-a.cjs test/stabilization.stage-b.cjs` | **11 passed** |
| `node --test test/stabilization.stage-c.cjs` | **4 passed**، رحلة كاملة وعزل وSMTP/OTP |
| Fresh disposable DB: `./node_modules/.bin/prisma migrate deploy` ثم `./node_modules/.bin/jest --config test/jest-phase1.json --runInBand` | **18 migrations؛ 3 passed** |
| `python3 scripts/backup/test_backup.py` | **8 passed**؛ actual restore وCV hash/permissions integrity |
| Frontend `npm run typecheck` | PASS |
| Frontend `npm run test:stabilization` | **4 passed**؛ cache race/SSR/auth contract |
| Frontend `npm run build` | PASS client + SSR |
| `git diff --check` للمستودعين | PASS |

الـtsconfig المؤقت extends الأصل، include `src/**/*.ts,test/**/*.ts`، exclude `node_modules,dist,scripts`، incremental false/noEmit true؛ مفيش suppression. Jest scripts تستخدم VM modules مع Node24.9+ وتحوّل TS فقط؛ sanitizer الحقيقي متغطّي. E2E scheduled processor startup متعطل للـfixtures فقط، وله unit suite فعلية. إعادة build/types/admin/HTTP privacy checks اتعملت بعد توسيع حجب legacy OTP في operations. دي نتائج source الحالية، مش شهادة على production.

## 7. Infrastructure and cost

نفس React Router + NestJS + Prisma + PostgreSQL + Docker Compose مناسب كنقطة بدء لـpilot صغير مع monitoring الموجودة، بشرط قياس الحمل الفعلي بعد الدعوة التدريجية. مفيش خدمة جديدة أو Redis/Kafka أو DB إضافية أو paid AI أو runtime dependency جديدة. package scripts اتغيرت للاختبارات بس؛ lockfiles زي ما هي.

مفيش load benchmark اتنفّذ ولا وعد capacity محددة. تستمر متابعة storage/CV وDB latency والبريد؛ تحسين SQL aggregation أو pagination للتاريخ يتعمل لو القياس أثبت احتياجه. موارد Docker الإضافية وقت العمل كانت disposable test resources فقط.

## 8. Remaining issues

| الأولوية | المطلوب | تأثيره |
|---|---|---|
| P0 | مفيش blocker source حرج معروف باقٍ ضمن الفحوص المنفذة | ده لا يغطي defects غير مكتشفة في المتصفح أو target deployment |
| P1 قبل الدعوة | تنفيذ وتوقيع manual browser matrix وإصلاح أي blocker يظهر | visual/keyboard/responsive غير مثبتين |
| P1 قبل الدعوة | SMTP smoke test على الهدف المقصود، register/verify/resend والفشل | OTP مطلوبة فعليًا؛ missing SMTP ما بقاش بيتجاوزها |
| P1 قبل التحديث | approved maintenance + consistent backup/off-host + isolated restore على نسخة مناسبة مع operator | ما اتعملش production backup/restore في العمل ده |
| P1 قبل التحديث | مراجعة target mapping ونسخ migration + API/front المتوافقة وخطة الرجوع | workflow paths القديمة مختلفة؛ ممنوع تخمين deployment target |
| P2 | مراجعة historical losses/seed resets وOTP log retention ضمن maintenance محددة لو لزم | لا استرجاع أو تنظيف تلقائي |
| P2 | اعتماد المنتج كتابةً للحد الفاصل بين peer progress وopportunity sharing | الحالية privacy-preserving؛ لا توسعة ظهور صامتة |
| P2 | مراجعة لغة المحتوى التحريري للأدمن حسب جمهور الـpilot | الواجهة مترجمة؛ النص الأصلي مش مترجم تلقائيًا |
| P3 | قياس زمن endpoint/history وحجم CV مع زيادة المستخدمين | لا bottleneck مثبت حاليًا؛ مفيش بنية جديدة مطلوبة مسبقًا |

## 9. Launch recommendation

**CONDITIONALLY READY — specific items outstanding**

الاختبارات والبناء والأنواع تثبت مسار كامل وبيانات تقارير منضبطة وحماية خصوصية على بيانات صناعية. الشروط الأربعة P1 فوق لازم تخلص قبل دعوة المستخدمين أو تعديل الهدف الفعلي. مفيش موافقة deploy ضمن التقرير، ومفيش ادعاء إن الاختبارات الآلية بديل عن browser QA أو production recovery drill.

## 10. Deployment checklist

- [ ] راجع commits على `stabilization/phase-2` في المستودعين؛ Phase1 baseline `a6b41fd`، A backend `066b7ba`/frontend `a5fd574`، B backend `4f22e2b`/frontend `1af4d51`؛ ملفات C والتقرير المجمع ضمن commit C لكل repo.
- [ ] حدد deployment target/repo/path/config الحقيقية بمراجعة بشرية؛ ما تستعملش مسارات workflows القديمة بالتخمين.
- [ ] نفّذ manual QA checklist على staging مع synthetic accounts ووقّع نتائج كل viewport/locale؛ عالج أي failure تمنع التقدم أو تعرض بيانات.
- [ ] افحص SMTP وverified-email recovery. اختبر register/verify/resend وdelivery failure، وخلّي default group assignment مؤجلة للتفعيل.
- [ ] operator يحدد downtime ويوقف الكتابات/SQL writers؛ **ما تعيدش تشغيل النسخة القديمة** قبل backup؛ startup القديمة موضع خطر فقد بيانات.
- [ ] اعمل consistent DB+CV backup بالأداة، verify، private off-host copy، ثم isolated restore drill ومطابقة المراجع والملفات والـpermissions. راجع runbook وUID/GID وretention.
- [ ] راجع migration SQL الاتنين في A؛ طبقها ضمن deployment معتمدة بعد النسخ. كل existing migrations الـ18 اتجربت fresh فقط. راجع database drift وتوافق PostgreSQL/Prisma والـenum على staging clone قبل الهدف الحقيقي.
- [ ] جهّز backend/frontend متوافقين، وافصل خطة rollback code عن additive schema وعن data recovery؛ مفيش destructive rollback أو seed reset.
- [ ] تحقق من safe configuration وhealth/alerts/SMTP quota وCV storage، ومن migrations startup behavior. لا تشغّل application على recovery target تلقائيًا.
- [ ] بعد deployment معتمدة مستقلًا: synthetic smoke للـonboarding/application/guidance/reports/admin، ثم دعوة محدودة تدريجية مع مسؤول دعم ومراقبة أخطاء/backup success.

تقارير التفاصيل: [A](/data/cms/NAWAH_PHASE_2A_JOURNEY_REPORT.md)، [B](/data/cms/NAWAH_PHASE_2B_REPORTS_REPORT.md)، [C](/data/cms/NAWAH_PHASE_2C_UX_LAUNCH_REPORT.md). التقارير موجودة كمان تحت `cms-back/docs` علشان تدخل Git رغم إن جذر `/data/cms` مش repository.
