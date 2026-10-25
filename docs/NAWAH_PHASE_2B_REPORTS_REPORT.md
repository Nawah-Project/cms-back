# نواة — تقرير تنفيذ Phase 2B

التنفيذ في `/data/cms/cms-back` و`/data/cms/cms-front` على فرع `stabilization/phase-2`. مفيش deploy أو وصول لبيانات حقيقية.

## التغييرات

- اتعاد استخدام مسار ReportsPage ومكوّن Modal ونفس الستايل والتبويبات والـSVG chart، مع حسابات من endpoint `/journey/reports`. بطاقات النتائج والمقارنة والرسم اليومي والسجل وتسجيل التغييرات موجودين. اتشالت حسابات CV eras اللي كانت بتنسب طلبات لنسخ سيرة بلا دليل، وأحكام التحسن السببية؛ بدلها سجل النسخ الفعلية وملاحظات محايدة. الصفحة ما بتنزّلش أول 1000 طلب وتحسب عليهم.
- utility مشتركة `reporting.util.ts` بين weeklyStats في الرحلة والتقارير. Logged = rows المسجلة؛ tailored = isTailored؛ cohort = journeyWeek المحفوظ. Positive = دليل assignment/interview/decision/acceptance، مع استبعاد NO_RESPONSE وWITHDRAWN. Rejection لوحدها مش positive. Interview/assignment تشمل transition history، والمقابلات السابقة غير المثبتة بتتعرض unknown، مش صفر مؤكد. Accepted/rejected/withdrawn/no-response هي outcome الحالية؛ الفئات متداخلة.
- التقرير بيقرأ كل الصفوف المملوكة في RepeatableRead transaction، ويطلع aggregates لكل أسبوع والتفعيل والإجمالي. مفيش client limit للتجميع. الرسم منفصل عن cohort tabs: تاريخ التسجيل من createdAt، وأحداث التقدم من changedAt؛ الطلب ممكن يبقى له أكتر من حدث. السجلات القديمة بلا تواريخ انتقال مش بنخترع لها event date.
- الـweekly review الحقيقية منفصلة عن USER_CHANGE وعن legacy structured change logs؛ CV history من UserCvHistory فقط. مفيش localStorage للسجل، ولا زيادة versions من reflection. فشل حفظ التغيير يحتفظ بالنص ويعرض retry، من غير نجاح وهمي.
- FINAL_REPORT بيفتح التقرير الكامل. `/journey/final-report/complete` بيتحقق من كل الـ24 predecessor ومن current node، وبيحفظ FINAL_REPORT في completedNodeCodes atomically. التكرار والتزامن آمنين. Admin funnel بيعتمد على العلامة الفعلية قبل تصنيف الأسبوع الرابع، بدل مجرد وصول العقدة أو عدد 15 عقدة.

## الملفات

Backend: `src/journey-engine/reporting.util.ts`, `journey-engine.service.ts`, `journey-engine.controller.ts`, `src/admin/admin.service.ts`, `test/stabilization.stage-b.cjs`.
Frontend: `src/app/features/reports/pages/ReportsPage.tsx`, `src/app/features/journey/components/JourneyQuestsMap.tsx`.

## التحقق الفعلي

كل DB tests على PostgreSQL17 disposable، `cms_test`، internal Docker network بلا ports وبيانات صناعية فقط. Node24 من images المحلية؛ نسخة source مؤقتة في `/tmp/nawah-phase2-nsuu1c_i`.

- `npm run prisma:generate && npm run build && node --test test/stabilization.stage-b.cjs test/stabilization.stage-a.cjs`: PASS، 11/11.
- إعادة `node --test test/stabilization.stage-b.cjs` بعد إضافة actual AdminService query: PASS، 4/4، تشمل تصنيف إكمال فعلي ورفض final ناقصة المتطلبات.
- `npm test -- --runInBand journey-engine.service.spec.ts journey-initialization.spec.ts`: PASS، 15/15.
- Frontend `npm run build`: PASS client وSSR. `npm run typecheck`: نفس 13 diagnostic قديمة في admin/i18n، مفيش diagnostic جديدة في ملفات B؛ إصلاحها ضمن C.
- فحوص B تشمل 1007 طلب كاملة، late interview بتاريخ منفصل، closed rejected interview، unknown history، حفظ versions9 من غير fake99، عزل مستخدم، reload، وconcurrent final acknowledgement واحد.
- Phase1 actual DB 3/3 وbackup/recovery 8/8 اجتازوا في قبول A؛ ملفاتهم والحماية لم تتغير في B. `git diff --check`: PASS.

## الحدود

السجل لا يثبت أي CV استخدم في أي application؛ مفيش استنتاج سببي. milestones اللي مفيش لها journey-week موثّق بتتعرض في السجل العام بدل تعيين أسبوع تخميني. التجميع الحالي بيقرأ minimal fields لكل rows في ذاكرة الباك، مناسب لـpilot صغير؛ مفيش ادعاء benchmark واسع. Weekly comparison وصف cohorts بمدد انتظار مختلفة. QA مرئي على المتصفح وfull suite ضمن C. مفيش quota أو curriculum أو schema إضافية في B.
