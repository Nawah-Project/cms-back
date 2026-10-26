# نواة — Analytics Design Acceptance وVisual QA

**الحالة:** قبول هندسي آلي مبدئي؛ **القبول البصري غير مكتمل**.
**الفرعان:** `feature/analytics-redesign` في `cms-front` و`cms-back`.
**Commits التنفيذ:** Frontend `b9ad1ff`؛ Backend `0a8e3f9`.
**النشر:** لم يتم. الاختبارات استخدمت بيانات وقاعدة اختبار فقط.

## 1. بيئة الفحص

- Frontend: Node 24 في Docker verification image، React Router client وSSR build.
- Backend: Node 24 + PostgreSQL 17 مؤقتة باسم `cms_test`، على Docker network داخلية بلا host ports.
- مفيش Browser control/Playwright executable أو browser session متاحة في بيئة التنفيذ. مفيش دخول لحساب مستخدم، أو فتح موقع الإنتاج، أو screenshots.
- قاعدة الاختبار احتاجت عمودي `ux_variant` بعد migrations الـ18 لتوافق Prisma schema. الإضافة اتعملت داخل قاعدة الاختبار فقط.

## 2. نتائج القبول من source والاختبارات

| المعيار | النتيجة | الدليل/التفصيل |
|---|---|---|
| العرض يتقسم إلى Analytics وتقارير أسبوعية وFinal منفصل | **PASS — source/tests** | final اختيار مستقل عن Week 4، واختبار SSR يراجع التمييز والقراءة فقط |
| empty state بدون chart أو أداء وهمي | **PASS — source/tests** | حالة صفر وحالة طلب واحد مغطاة في اختبارات frontend |
| chart تفاعلي وبياناته factual | **PASS — source/tests** | day/week/month bins، period/cumulative، عدم تغير مجموع الأحداث، تواريخ UTC الفعلية، وأحداث checkpoints محفوظة |
| stage وoutcome وmilestone منفصلين | **PASS — source/tests** | اختبارات populated analytics؛ outcome الحالي لا يعاد تقديمه كـhistory |
| التقرير الأسبوعي يعرض النشاط والانعكاس المحفوظ | **PASS — source/tests** | اختبار ظهور نص الانعكاس والتمييز عن dashboard التحليلات |
| الوصول للأسبوع يتبع تقدم الرحلة | **PASS — source/tests** | سيناريو عضو مبكر يتيح continuous analytics ويبقي التقرير الأسبوعي والنهائي مقفولين |
| Admin preview DEMO/ACTUAL وقراءة فقط | **PASS — source + PostgreSQL E2E** | صلاحية Admin/رفض member، عدم تبديل state، وعدم إنشاء journey state في قراءة فارغة |
| عينات DEMO المطلوبة | **PASS — fixture tests** | EMPTY، ONE، EARLY، إكمال Week 1، إكمال Weeks 1–3، 30 سجلًا وتغييرات، ورحلة كاملة |
| Arabic/English labels وعناصر الواجهة | **PASS — source presence only** | النصوص موجودة باللغتين؛ الاتجاه وتناسق التخطيط بصريًا لم يتم التحقق منهما |
| Keyboard/focus وtooltip عمليًا | **NOT VERIFIED** | يتطلب Browser؛ الاختبارات الآلية لا تثبت حركة focus أو ظهور tooltip على الجهاز |
| Mobile 390×844 وDesktop 1440×900 | **NOT VERIFIED** | لا screenshots أو browser viewport |
| RTL/LTR وLight/Dark | **NOT VERIFIED** | لا browser render في هذه الجلسة |
| `git diff --check` في المستودعين | **PASS** | لا whitespace errors في التغييرات الحالية |

## 3. نتائج الأوامر المركزة

- Backend unit: **3 suites / 10 tests — PASS**.
- Backend Admin Preview HTTP E2E: **2 tests — PASS** على PostgreSQL اختبار صناعية.
- Backend Prisma generate وproduction build — **PASS**.
- Frontend `npm run typecheck` — **PASS**.
- Frontend stabilization checks — **13 tests — PASS**.
- Frontend React Router production client + SSR build — **PASS**.

دي نتائج كود واختبارات، ومش بديل لفحص العرض الفعلي. الـE2E الأول واجه في قاعدة الاختبار missing `ux_variant` بعد migrations، ثم نجح بعد إضافة العمودين لتلك القاعدة المعزولة؛ لا تغيير في production. بعد الاختبارات اتقفلت قاعدة الاختبار والـDocker network المؤقتة.

## 4. Screenshots

**لا توجد screenshots فعلية.** لم أستخدم Browser، لذلك لا أرفق صورًا مولدة أو صور source code باعتبارها دليل عرض. بعد توفر Browser، احفظ الصور في مجلد artifacts منفصل واربط كل صورة بمقاسها ولغتها وحالة DEMO المحددة.

## 5. Checklist لإكمال Visual Acceptance يدويًا أو بجلسة Browser لاحقة

- [ ] فتح `/reports` على `1440×900` و`390×844`، باللغة العربية والإنجليزية.
- [ ] فحص `EMPTY` و`ONE` و`EARLY` و`POPULATED` و`COMPLETED` على route معاينة Admin بعد نشر الفرع الموافق.
- [ ] فحص `WEEK1_COMPLETE` و`WEEK3_COMPLETE`؛ التأكد من قفل الأسابيع التي لم تتحقق شروطها ومن فصل Final عن Week 4.
- [ ] فتح التقرير الأسبوعي والنهائي؛ التأكد أن reflection والنصوص محفوظة ومنسوبة للأسبوع الصحيح.
- [ ] تجربة period/cumulative، إخفاء وإظهار السلاسل، اختيار نقطة التاريخ بالكيبورد/اللمس، tooltip والجدول البديل.
- [ ] مراجعة overflow، legends، axes، focus ring، RTL للأرقام/الإنجليزية المضمنة، وdark theme إذا كان مفعّلًا.
- [ ] فحص loading/error/retry على حالات الشبكة، والتأكد من أن ACTUAL selector لا يعرض إلا لأدمن مخوّل.
- [ ] التقاط screenshots فعلية وتسجيل النتيجة: Passed/Failed مع reproduction وviewport واللغة.

## 6. قرار القبول

**القرار الحالي: SOURCE-READY FOR REVIEW؛ NOT VISUALLY ACCEPTED؛ NOT DEPLOYED.**

الاختبارات والبناء يثبتوا السلوك المغطى فقط. لا أوصي باعتبار التصميم مقبولًا بصريًا قبل تنفيذ checklist أعلاه، ومراجعة تقرير dependency advisories. مفيش migration schema مطلوبة ولا بيانات production تغيرت. يمكن تجهيز release بعد مراجعة الكود ونتائج الـbrowser، من غير استخدام هذا المستند كإذن نشر تلقائي.
