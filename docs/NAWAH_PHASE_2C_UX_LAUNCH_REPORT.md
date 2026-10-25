# نواة — تقرير تنفيذ Phase 2C

**التاريخ:** 26 أكتوبر 2026 بتوقيت القاهرة. **المسارات:** `/data/cms/cms-back` و`/data/cms/cms-front`، فرع `stabilization/phase-2`. النسختين المنفصلتين `/data/cms-back` و`/data/cms-front` ما اتعدلوش؛ تعديل المستخدم الموجود في guided tour هناك اتساب زي ما هو. مفيش deploy أو اتصال بقاعدة حقيقية أو تغيير containers/volumes قائمة.

## اللي اتصلح

| المشكلة | التنفيذ والنتيجة |
|---|---|
| U01 رحلة بتفضل skeleton مع API error | JourneyQuestsMap تعرض error/retry. TasksPage كمان بتميز فشل تحميل صلاحية الرحلة عن القفل الفعلي؛ Guidance تعرض failure واضحة مع retry وتوضح catalog fallback |
| U02 conditional hooks | إصلاح A اتثبت؛ كل hooks في TasksPage قبل access/loading returns |
| U03 العربية والإنجليزية | واجهة الإرشادات وreader وreports وOTP delivery recovery مترجمة حسب locale؛ تصحيح activityFilter keys في ar/en بدل nested object غير مدعوم. محتوى الأدمن التحريري بلغته الأصلية، مش ترجمة AI مخفية |
| U04 ملفات المراجعة | picker PDF من A؛ backend يرفض non-PDF. رفع CV ما يقفلش reflection |
| U05 keyboard | guidance cards buttons فعلية؛ specialization input يدعم arrows/Enter/Escape وlistbox/active descendant؛ modal مشتركة وguidance reader فيها initial focus وTab cycle وEscape وعودة focus. Notifications Escape يقفل القائمة |
| U06 admin props | ConfirmDialog message/isConfirming، ActivityBadge days، StageCounts contract، ErrorState message، mentoring publishedAt/onChanged؛ TaskFormDialog modes/member/group contracts وcreate payload صحيحة من غير casts لإخفاء أخطاء |
| U07 email preferences | اتشالت toggle المحلية اللي ما كانتش بتغيّر إرسال البريد؛ مكانها وصف صريح إن الإرسال من إعدادات المنصة وإن التحكم الفردي غير متاح |
| نجاح قراءة تنبيه وهمي | اتشالت optimistic read اللي ما كانتش بترجع عند PATCH failure؛ unread state تتحدث بعد تأكيد API. failures تظهر مع retry، وpending IDs تتحرر بعد الفشل |
| Logout failure | بيانات الحساب والـcache تتشال محليًا، ومع فشل السيرفر تظهر رسالة إن إنهاء الجلسة غير مؤكّد وزر إعادة محاولة. مفيش ادعاء إن cookie السيرفر اتلغت من غير اتصال |

## readiness وSMTP

`JwtAuthGuard` بيتحقق، بعد authentication، من readiness لمسارات البرنامج: emailVerified حقيقية + targetJobTitle + portfolio + CV. مسارات auth/profile والتعافي متاحة قبل الإكمال؛ admin bypass محفوظ. إدخال 5 طلبات ما ينفعش يلتف على بوابة الإكمال من API مباشرة.

اتشال production bypass اللي كان بيعتبر البريد verified لما SMTP مش مهيأة. الحساب الجديد دايمًا pending لحد التحقق. فشل إرسال OTP بعد commit الحساب بيرجع حساب authenticated مع `verificationDelivery: FAILED` بدل error يخلي المستخدم يسجل تاني ويصطدم بـduplicate email. Login غير الموثّق برضه متاح للتعافي. Resend يفشل بوضوح عند delivery failure، وما يرجعش sent وهمية. Hook التسجيل والدخول يستخدموا public user الراجعة من نفس mutation ويحافظوا على delivery state؛ normalization ما يعتبرش verified إلا القيمة true.

**متطلب تشغيل:** لازم SMTP حقيقية شغالة قبل دعوة المستخدمين. تم اختبار failure/retry صناعيًا؛ لم يتم إرسال بريد فعلي لمستخدم أو تعديل SMTP configuration.

## الخصوصية والعزل

- **H01:** نفس المجموعة تقدر تتابع stage/outcome والنشاط العام، لكن company/job title/job URL/application method/location الخاصة في feed وmember detail تتعرض فقط لصاحبها أو لما `sharedWithGroup=true`. تطابق الشركات بين الأعضاء بيتحسب للفرص المشاركة فقط. ده temporary privacy-preserving resolution للـpilot في النقطة اللي وصفها القديم مش حاسم. السماح بإعادة استخدام/مشاركة فرصة تفضل opt-in؛ لا توسعة ظهور. CV/portfolio يفضلوا حسب سياسة نفس المجموعة الحالية، وCV history لصاحبه/admin فقط؛ cross-group access مرفوض.
- **H02:** تغيير identity يلغي queries المعلقة ويمسح QueryClient ويعيد mount subtree علشان local component data كمان ما تفضلش. Guard لرد `/me` المتأخر يمنعه من رجوع identity قديمة بعد تغيير الجلسة. اختبار فعلي للـQueryClient أثبت إن request A المتأخرة لا تكتب فوق بيانات B.
- **H03:** كود OTP ما بقاش في subject، ولا stored body، ولا fallback logs؛ test-only capture في الذاكرة فقط. الـadmin APIs بتحجب محتوى OTP القديم كمان، بما فيه subject/error في operations. Retry لرسالة OTP قديمة مرفوض، والزر ما بيظهرش ليها؛ المستخدم يطلب كود جديد من authenticated verification flow.
- السجلات القديمة في قاعدة حقيقية لم يتم تعديلها أو حذفها. وجود أكواد قديمة داخل DB/backup تاريخية يحتاج operator access/retention policy؛ التطبيق لا يعرضها ولا يعيد إرسالها.

## الملفات الأساسية

Backend: `auth.service.ts`, `email-sender.service.ts`, `jwt-auth.guard.ts`, `members.service.ts`, `admin.service.ts`, `admin-notifications.service.ts`، وتصحيح رسالة Task0 في journey service علشان ما توعدش بفتح tasks بدري. مفيش schema migration في C.

Frontend: auth API/hooks/store وEmailVerificationGate، NotificationCenter، Modal و`useDialogFocus.ts`، SpecializationCombobox، GuidancePage/GuidanceReadingModal/TasksPage/JourneyQuestsMap، admin community/mentoring/notifications/operations/overview/UX lab، ومفاتيح ar/en. ReportsPage اتنسّقت بعد تنفيذ B وبقت تستخدم button classes الموجودة فعلًا، والتغيير المهني اليدوي بيبقى private في المجموعة.

اختبارات: تحديث fixtures في profile/members/tasks/feedback، E2E fixtures للـreadiness الحالية، `program-fixture.ts`, `setup-processors.ts`, `content-sanitizer.spec.ts`, `stabilization.stage-c.cjs`، و`cms-front/scripts/stabilization-checks.mjs`. package scripts بس اتغيرت؛ مفيش dependency جديدة ولا lockfile change.

## الفحوص المنفّذة

بيئة الاختبار Node24.21.0 من cached images، PostgreSQL17 داخل internal network بلا ports. Source copies منفصلة في `/tmp/nawah-phase2-nsuu1c_i` من غير env أو outputs المشروع. كل البيانات صناعية. قاعدة compat جديدة وفارغة استُخدمت لاختبارات Phase1. ما اتعملش npm install.

| الأمر داخل source copy | النتيجة الفعلية |
|---|---|
| `npm run prisma:generate && npm run build` | PASS backend production build |
| `./node_modules/.bin/tsc --noEmit --incremental false` | PASS، شامل src unit specs؛ خطأ feedback القديم اتصلح |
| `./node_modules/.bin/tsc -p tsconfig.stabilization-check.json` | PASS بconfig مؤقت يضم src وtest معًا، rootDir `.`، بلا suppressions |
| `npm test -- --runInBand` | PASS — **107/107، 20 suites** |
| `npm run test:e2e` | PASS — **46/46، 7 suites** |
| `node --test test/stabilization.stage-a.cjs test/stabilization.stage-b.cjs` | PASS — **11/11** على DB فعلية |
| `node --test test/stabilization.stage-c.cjs` | PASS — **4/4** على التطبيق الكامل وHTTP |
| `./node_modules/.bin/prisma migrate deploy` على fresh compat DB | PASS — كل **18 migration**، من ضمنها 2 بتوع A |
| `./node_modules/.bin/jest --config test/jest-phase1.json --runInBand` على fresh compat | PASS — **3/3** لحفظ البيانات وadmin seed edits |
| `python3 scripts/backup/test_backup.py` | PASS — **8/8**، الجولة الأخيرة 161.802s؛ actual recovery template وroundtrip وعزل المصدر |
| Frontend `npm run typecheck` | PASS؛ الـ13 diagnostics القديمة اتصلحوا |
| Frontend `npm run test:stabilization` | PASS — **4/4**، actual QueryClient race + SSR failure/empty-final markup + auth failed-delivery contract |
| Frontend `npm run build` | PASS client وSSR |
| `git diff --check` في المستودعين | PASS |

`tsconfig.stabilization-check.json` مؤقت extends tsconfig.json ويضبط `rootDir:'.', noEmit:true, incremental:false` وinclude `src/**/*.ts,test/**/*.ts`، ويستبعد node_modules/dist/scripts فقط. مفيش type suppression أو حذف test علشان النتيجة تبقى green.

Jest اتصلح بتشغيل `--experimental-vm-modules` على Node24 وبـtransform للـTS فقط؛ JS dependencies تستخدم ESM الفعلية، من غير sanitizer shim/mock. اختبار sanitizer جديد بيشغّل الدالة الحقيقية ويرفض script/onclick/javascript links. scheduled no-response startup متعطلة في E2E fixtures فقط عشان ما تسابقش timestamps الصناعية؛ processor suite نفسها شغالة. group suites تختبر legacy opt-in registration assignment صراحة، واختبار default activation الحقيقي في HTTP. test reset بيشيك اسم DB الفعلي وTEST_DATABASE_URL قبل أي truncate صناعي.

### تغطية HTTP الكاملة

التسجيل → OTP خاطئة ثم سليمة → readiness denial قبل الإكمال → portfolio/specialization → رفض non-PDF ثم upload PDF → كل **25 node** بالـquotas الأصلية وإشارات التطبيقات الفعلية → قراءات إرشاد محفوظة وtasks unlock → 3 reviews + LinkedIn + outreach → final whole-journey report → explicit completion مرتين → logout/login → completed محفوظة. الوقت اتحرك بتواريخ fixtures معزولة فقط، مش انتظار أسابيع أو تعديل production.

اختبارات إضافية شغّلت group feed/detail private/shared وCV access بين مجموعات، SMTP failure ثم fresh-code resend، وOTP log redaction/retry rejection. آخر privacy check وسّع فحص redaction إلى operations endpoint كمان، مع إعادة build/types واختبار admin والوصول HTTP.

## Browser QA وحدود الإثبات

مفيش browser automation tool أو Chromium/Firefox متاحين. **لم يتم تنفيذ visual/responsive/real keyboard interaction QA** ولا أخذ screenshots. الأربع frontend checks هي SSR/cache/contracts، مش بديل browser. Checklist التنفيذ: [NAWAH_PHASE_2_MANUAL_QA.md](/data/cms/NAWAH_PHASE_2_MANUAL_QA.md)، تشمل 390×844 و1440×900 وRTL/LTR وكل الشاشات والـfailure/retry والـkeyboard.

Logs آخر القبول: `stage-c-final-acceptance.log`, `stage-c-final-privacy.log`, `stage-c-operations-redaction.log`, `stage-c-all-test-types.log`, `stage-c-front-release.log`, `phase1-db-final.log`, `phase1-backup-final.log` تحت المسار المؤقت. النتائج الأساسية مثبتة هنا ومش محتاجة بقاء `/tmp`.

## موقف الإطلاق

الإصلاحات الآلية مكتملة، لكن الدعوة لمستخدمين حقيقيين مش مصرح بيها قبل manual browser QA، SMTP smoke test على deployment الاختبار المقصودة، وconsistent production backup/off-host/restore drill مع operator. دي مش عمليات اتنفذت ضمن المرحلة. راجع التقرير المجمع [NAWAH_MVP_LAUNCH_READINESS.md](/data/cms/NAWAH_MVP_LAUNCH_READINESS.md).
