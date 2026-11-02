> Historical documentation: Studio P0 was retired on 2026-11-02. These endpoints and grants are no longer available. See [retirement notes](retire-studio-p0.md).

# Individual Experience Studio — تسليم P0

هذا التنفيذ على الفرع `feature/individual-experience-studio-20261101` في المستودعين. لم يُنشر، ولم تُطبّق أي migration على الإنتاج. توثيق التشخيص السابق للتنفيذ: [قرار التصميم](individual-experience-studio-design.md).

## ما أضافه P0

مساحة `/admin/ux-lab/individual-research` قابلة للوصول من UX Lab ومن الشريط الإداري عند امتلاك الصلاحية. ثماني مساحات مترابطة: Overview، Individual Plan، Sessions، Observations، Interventions، Journey Controls، Timeline، Review. البحث والفلترة والترقيم للحالات؛ حالات Draft/Active/Paused/Completed؛ المسؤول والمصرح لهم، الموافقة، الاحتفاظ، العائق والخطوة التالية ومواعيد المتابعة.

الخطة الحالية سجل خطوات خاص بالمسؤول، بإكمال يدوي موثق لا يكتب JourneyNode. ترتبط بمهام وDIRECT Feedback موجودين أو تنشر موردًا جديدًا عبر نفس الخدمات، داخل نفس معاملة PostgreSQL الخاصة بالربط والتدقيق. لا يُرسل بريد من Studio، ولا يتحول نص جلسة أو ملاحظة إلى رسالة عضو تلقائيًا.

تعرض Overview لقطة Prisma للحالة الفعلية دون استدعاء `evaluateProgress`. صفحة الإتاحة تجمع الحقوق الطبيعية والاستثنائية ومصدر كل حق. العضو يرى عنوان المشاركة وغرضها ومدة الاحتفاظ وحالة الموافقة فقط في Profile؛ لا يحمّل API الحالة الخاصة أو الملاحظات أو الفرضية. عنوان الحالة وهدفها ينبغي أن يصاغا بما يناسب ظهورهما للمشارك.

## مصدر الحقيقة وسياسة الوصول

| المورد | مصدر الحقيقة/موضع تطبيق القرار |
|---|---|
| الإنجاز | `UserJourneyState` وJourneyEngine؛ grant لا يكتب فيهما |
| إتاحة أقسام العضو | `getJourneyStateSummary` يعرض `normalFeatures` ثم features الفعلية |
| الإرشادات | نفس Feedback visibility + `unlockedWhere`؛ POST القراءة في Feedback وJourney يتحقق من INTERACT |
| المهام المهنية | `TasksAccessGuard` يميز GET/HEAD VIEW عن mutations INTERACT؛ شروط المهمة وملكيتها تبقى كما هي |
| التقارير | `GET /journey/reports?scope=…` يتحقق من النطاق المحدد في snapshot المعاملة |
| الملاحظات البحثية | صلاحية INDIVIDUAL_RESEARCH، ثم مالك الحالة/قائمة مصرح لهم؛ Root مخوّل |

الحق الطبيعي يظل متاحًا بعد الإلغاء. الاستثناء الفعّال يتطلب حالة ACTIVE، موافقة GIVEN، احتفاظًا ساريًا، بداية حان موعدها، وعدم الإلغاء أو انتهاء الفترة. INTERACT يتضمن VIEW. تقارير الأسبوع والأداء والنهائي تقبل VIEW فقط. إتاحة إرشاد INTERACT تسمح بفعل القراءة الصريح، وتبقي شرط رفع CV معدل للإرشاد التأسيسي؛ VIEW وحدها لا تسجل قراءة. مشاهدة النهائي لا توسع API الإكمال.

الموارد المسموحة في P0:

- `FEATURE / analytics` — عرض الأداء؛ `professionalTasks` — VIEW أو INTERACT؛ `tableView` — عرض جدول الطلبات. عرض الجدول يغير هيئة العرض فقط، وصلاحيات تعديل طلبات الشخص الأصلية تبقى سارية.
- `GUIDANCE / code` — أكواد كتالوج الإرشادات الحالي فقط. المحتوى الفردي الجديد يُرسل عبر DIRECT Feedback؛ لا نقبل كودًا مجهولًا يوحي بإتاحة غير مطبقة في الواجهة.
- `WEEKLY_REPORT / 1..4`، `PERFORMANCE_ANALYTICS / performance`، `FINAL_REPORT / final` — VIEW.
- `PLAN_ITEM` محجوز للتوسع ويعيد 400 في هذا الإصدار. لا توجد واجهة عضو لخطة بحثية ثانية موازية لمحرك الرحلة.

`source`: NORMAL / ADMIN / SCHEDULED / EXPIRED / REVOKED / LOCKED. عضو المنصة يتلقى سببًا عامًا؛ سبب الأدمن الحر يظل في الحالة الخاصة. `features.analytics` قد يتيح دخول صفحة التقارير بسبب أسبوع واحد، لكنه لا يمنح Performance أو أسابيع أخرى؛ API وواجهة التبويبات يطبّقان `reportAccess` لكل نطاق.

التقرير الأسبوعي الاستثنائي يستخدم بيانات الأسبوع المطلوب مع أرقام الأسبوع السابق للمقارنة الموجودة أصلًا؛ لا يختلق أصفارًا للأسبوع السابق. بقية مراحل التقارير لا تُعرض من هذا النطاق. الأداء المبكر يفتح الرسومات للقراءة ببيانات فعلية، ويبقي أهلية التحديث اليدوي والإنجاز كما هما. المعاينات الإدارية الحالية لا تتغير إلى معاينة عضو بصلاحيات موسعة.

## نموذج البيانات وmigration

المضاف: `prisma/migrations/20261101010000_individual_experience_studio/migration.sql`.

| النموذج | الوظيفة |
|---|---|
| IndividualResearchCase | المشارك والمسؤول وACL والهدف والفرضية والحالة والموافقة وموعد حذف البيانات والمراجعة |
| IndividualCaseSession | Consulting/Coaching/Research، التصريحات منفصلة عن الملاحظات والفرضيات والنتيجة والمتابعة |
| IndividualCaseObservation | نوع السجل ومحور القدرات/أثر المستفيد/البزنس والدليل وحالة التحقق والعائق |
| IndividualCasePlanItem | خطوة متابعة، دليل الإكمال، المورد والمحطة المرتبطة، وروابط Tasks/Feedback |
| IndividualAccessOverride | المورد والصلاحية والسبب والمُصدر والفترة والإلغاء |
| IndividualCaseEvent | سجل خاص للفعل والمسؤول والوقت والمورد ومفتاح إعادة المحاولة؛ أسماء حقول التعديل دون تكرار قيم الملاحظات |

الـSQL إضافي فقط: ستة جداول وفهارس وعلاقات. لا DROP/TRUNCATE/تعديل صفوف مستخدمين قائمين. روابط العضو والحالة Cascade؛ روابط مهمة/Feedback محذوفين SetNull. المالك Restrict: تُنقل مسؤولياته قبل حذف حساب أدمن مالك لحالات. حذف حالة بحثية لا يحذف تدخلًا سبق نشره في أنظمة Tasks/Feedback العامة.

كل mutation يحمل `requestId` من نوع UUID. المعاملات تقفل صف الحالة `FOR UPDATE` وتمنع تكرار نشر التدخل/الربط عند إعادة المحاولة المتزامنة. إعادة المفتاح لفعل مختلف تعيد 409. للإنشاء مفتاح فريد للحالة. الحذف النهائي idempotent من حيث غياب البيانات؛ إعادة طلب حذف مورد اختفى تعيد 404.

## API contracts

كل المسارات التالية تحتاج JWT وأدمن مع صلاحية القسم، إضافة إلى ACL الحالة. READ لا يسمح بأي POST/PATCH/DELETE. صلاحية UX_LAB وحدها لا تسمح بقراءة هذه البيانات.

| Method | `/admin/individual-research` + المسار | العقد |
|---|---|---|
| GET | `/candidates?search=` | WRITE؛ أسماء/تخصصات أعضاء حاليين، بحد 30 |
| GET | `/staff` | READ؛ مسؤولون لديهم صلاحية البحث، وأهلية ملكية الحالة |
| GET | `/cases?search=&status=&page=&limit=` | قائمة مصفّاة حسب ACL، حد أقصى 50 |
| POST | `/cases` | `{requestId,userId,title,goal,hypothesis,retentionUntil,ownerId?,allowedAdminIds?}`؛ Draft |
| GET | `/cases/:id` | snapshot، آخر السجلات، counts، موارد الربط، accessOverview؛ يسجل اطلاعًا خاصًا |
| PATCH | `/cases/:id` | requestId + حالة/عنوان/فرضية/خطوة/متابعة/مراجعة/ACL؛ تغيير ACL للمالك أو Root فقط |
| POST | `/cases/:id/consent` | `{requestId,confirmed:true,method:WRITTEN|VERBAL,consentAt,evidence}` |
| POST | `/cases/:id/withdraw` | `{requestId}`؛ سحب الموافقة وإلغاء grants الحالة |
| POST | `/cases/:id/sessions` | requestId, kind, heldAt, goal؛ topics/statements/observations/barriers/hypotheses/agreements/nextActions/outcome/followUpAt/followUpStatus اختيارية |
| PATCH | `/cases/:id/sessions/:sessionId` | requestId, followUpStatus، outcome/followUpAt اختيارية |
| POST | `/cases/:id/observations` | requestId, kind, lens, content, status، evidence/sessionId/isBarrier اختيارية |
| PATCH | `/cases/:id/observations/:observationId` | requestId, status, evidence? |
| POST | `/cases/:id/plan` | requestId,title,completionCondition؛ goal/activity/resourceUrl/nodeCode/taskId/feedbackId/dueAt اختيارية |
| PATCH | `/cases/:id/plan/:itemId` | `{requestId,status:OPEN|DOING|DONE|BLOCKED}`؛ لا يغير المحرك |
| POST | `/cases/:id/interventions` | `{requestId,kind:TASK|FEEDBACK,title,content,publishConfirmed:true,existingId?}` |
| POST | `/cases/:id/overrides` | `{requestId,resourceType,resourceId,permission,reason,startsAt,endsAt?}` |
| POST | `/cases/:id/overrides/:overrideId/revoke` | `{requestId}` |
| DELETE | `/cases/:id` | حذف نهائي للسجل البحثي التابع فقط |

عضو المنصة: `GET /individual-research/participation` يعيد projection آمنة للحالات الخاصة به؛ `POST /individual-research/participation/:id/withdraw {requestId}` يسحب مشاركته فقط. هذان المساران JWT-only عمدًا، ليظل سحب الموافقة ممكنًا حتى إن لم يعد الملف المهني مكتملًا؛ تظهر بطاقة المشاركة أيضًا أسفل شاشة الاستقبال في هذه الحالة.

التقارير: `GET /journey/reports?scope=performance|week:1|week:2|week:3|week:4|final`. النطاق الافتراضي performance. أضيفت `scope` و`access` للاستجابة؛ حقول التقدم والإنجاز تبقى حقيقية.

أخطاء متوقعة: 400 مورد/انتقال/بيانات غير صالحة، 403 صلاحية كتابة/موافقة/إتاحة غير كافية، 404 حالة غير متاحة أو خارج ACL، 409 إعادة استخدام مفتاح لفعل مختلف أو تغيير شروط الموافقة. وجود الحالة لا يُكشف لأدمن خارج ACL بواسطة رسالة مختلفة.

## الموافقة والاحتفاظ

- لا جلسات/ملاحظات/تدخلات/grants قبل Active + موافقة موثقة. لا صوت أو فيديو أو تشخيصات أو درجات نفسية في النموذج.
- احتفاظ صريح أقصاه 366 يومًا من الإعداد؛ الواجهة تقترح 90 يومًا. لا يمكن تمديد فترة وافق عليها المشارك أو تغيير الغرض تحت الموافقة القديمة؛ يلزم سجل جديد وموافقة جديدة. يسمح بتقصيرها من API. تعديل الفرضية الداخلية لا يبدل تصريح المشارك.
- سحب الموافقة نهائي لهذه الحالة؛ لا يعاد تنشيطها بالموافقة القديمة. السجلات تبقى للمصرح لهم حتى نهاية الاحتفاظ أو حذفها يدويًا. التدخلات المنشورة تظل بيانات عادية في حساب العضو، وتُحذف وفق سياسة حسابه.
- عند انتهاء الاحتفاظ تختفي الحالة من APIs فورًا؛ عامل كل 30 دقيقة يحذفها وتوابعها من قاعدة التشغيل. إخفاقه يسجل تحذيرًا عامًا بلا محتوى خاص. النسخ الاحتياطية تتبع سياسة الاحتفاظ التشغيلية القائمة؛ هذه الإضافة لا تمحو نسخة احتياطية تاريخية.
- سجل التدقيق داخل الحالة ويُحذف معها عند طلب حذف بيانات البحث. لا نخزن نسخة ثانية من النصوص الخاصة في اللوجات أو Marketing أو أحداث المجموعات.

## الملفات المتغيرة

Backend:

- `src/individual-research/`: module/controller/DTO/service، وسياسة IndividualAccess واختبارها.
- `src/app.module.ts` و`src/admin/admin-access.ts`: تسجيل الوحدة والصلاحية.
- `src/journey-engine/journey-engine.{controller,service}.ts` و`reporting.util.ts`: دمج قرارات الإتاحة، scopes، وقراءة حقيقية دون تقدم وهمي.
- `src/feedback/feedback.service.ts`: نفس visibility مع موارد مسموحة، وحماية VIEW من POST القراءة، ومعاملة نشر قابلة لإعادة الاستخدام.
- `src/tasks/tasks.service.ts` و`tasks-access.guard.ts`: الفصل بين VIEW/INTERACT، وإعادة استخدام إسناد مهمة داخل المعاملة.
- `prisma/schema.prisma` وmigration المذكورة، `test/individual-research.e2e-spec.ts`، `scripts/seed-individual-research-qa.cjs`.

Frontend:

- `features/admin/individual-research/{IndividualResearchPage.tsx,api.ts,individual-research.css}`.
- `routes.ts`، `components/AppSidebar.tsx`، `features/admin/{adminAccess.ts,AdminUxLabPage.tsx,AdminMentoringPage.tsx,components/AdminAccessPanel.tsx}`، ونوع User للصلاحية الجديدة.
- `features/auth/components/IndividualParticipationPanel.tsx` و`pages/ProfilePage.tsx` و`features/profile/ProfileCompletionGate.tsx` لسحب الموافقة حتى قبل اكتمال الملف.
- `features/journey/types.ts`، `features/reports/pages/ReportsPage.tsx`.
- `features/professional-development/pages/{GuidancePage,TasksPage}.tsx` ومكوّنا GuidanceReadingModal وTaskDetailModal: عرض فقط واضح دون تسجيل قراءة تلقائيًا.
- `scripts/stabilization-checks.mjs`: نقل fixtures التقارير لمفتاح cache المقيّد بالنطاق، مع الحفاظ على assertions القديمة.

## سيناريو تجربة شخص واحد

1. امنح المسؤول INDIVIDUAL_RESEARCH WRITE من Root، وREAD لمن يراجع فقط. هذا لا يمنحه MENTORING أو تقارير أعضاء تلقائيًا.
2. افتح «التجارب الفردية»، اختر العضو الموجود، واكتب عنوانًا وهدفًا مناسبين للظهور للمشارك، وفرضية بحثية داخلية وموعد حذف. ابدأ Draft.
3. اشرح الغرض والملاحظات ومن سيطلع عليها والاحتفاظ وحق السحب. بعد موافقة حقيقية وثّق الوسيلة والوقت ودليلًا مختصرًا، ثم Active.
4. سجّل جلسة Consulting أو Coaching؛ اكتب تصريحات الشخص منفصلة عن ملاحظتك وتفسيرك. أضف ملاحظة HYPOTHESIS بمحور ABILITIES أو USER_IMPACT أو BUSINESS_IMPACT وحدود الدليل، دون تشخيص.
5. أضف خطوة للخطة بدليل إكمال واضح، واربطها بمهمة حالية أو انشر مهمة/توجيهًا مناسبًا للمشارك مع تأكيد نشر صريح.
6. من الإتاحة امنح `WEEKLY_REPORT / 2 / VIEW` بفترة وسبب. جرّب حساب المشارك: تقرير الأسبوع الثاني يظهر بالموجود فعلًا، بينما Mission 0 ما زالت حالته. الأداء/الأسابيع الأخرى لا تُفتح من هذا المنح.
7. حدّث متابعة الجلسة والنتيجة، وحالة الملاحظة والخطوة وفق دليل حقيقي. Mentoring يفتح على العضو ويحتفظ برابط العودة للحالة.
8. راجع Timeline وReview: ما تغير؟ ما دليله؟ ما الذي لا تكفي أدلته؟ لا تنسب سببية إلى مشاهدة صفحة أو تجربة شخص واحد.
9. Revoke يعيد القواعد الطبيعية. Pause/Complete يعطلان استثناءات الحالة. يستطيع المشارك سحب الموافقة من Profile. الحذف النهائي يزيل البحث الخاص، ولا يحذف حسابه أو بيانات نشره العامة.

## نطاق الاختبار والحدود

نتائج التشغيل التفصيلية مسجلة في [التحقق](individual-experience-studio-validation.md). لم تُجر اختبارات على بيانات حقيقية أو SMTP فعلي، ولم تُختبر هذه الواجهة على جهاز iOS/Android مادي أو جميع محركات المتصفحات. اختبار الهاتف في Chromium بأبعاد 390×844، والعربية/الإنجليزية والكيبورد وتقليل الحركة.

عرض التفاصيل محدود بآخر 100 جلسة/ملاحظة/خطوة و200 grant/event مع counts؛ لا توجد بعد pagination للتاريخ الطويل أو تصدير بحثي. التخزين يحتفظ بالباقي داخل مدة الاحتفاظ. دعم التقاط صوت/فيديو أو ملفات بحثية غير موجود عمدًا.

P1: خطة عضو تفاعلية وفتح خطواتها بناءً على أحداث حقيقية، مقارنة منظمة عبر جلسات متعددة، ملخص/تصدير التجربة، وروابط متقدمة من Member Inspector/Journey Observatory. لا منهج تدريب نهائي ولا توصيات AI أو تقييم نفسي أو استدلال سببي من عينة واحدة.

## قرار الدمج لاحقًا

يلزم مراجعة ترابط نسختي الفرونت والباك وmigration في staging أولًا. عند اعتماد نشر منفصل مستقبلًا: النسخة الخلفية وmigration الإضافية قبل واجهة تحتاج عقودها. لا يفعّل هذا الفرع أي نشر أو موافقة إصدار، ولا يغير Workflows أو أسرار أو إعدادات إنتاج. الرجوع لكود التطبيق لا يستدعي حذف جداول البحث؛ لا تستخدم `migrate reset` أو reset test ضد قاعدة قائمة.
