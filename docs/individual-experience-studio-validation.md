> Historical documentation: Studio P0 was retired on 2026-11-02. These endpoints and grants are no longer available. See [retirement notes](retire-studio-p0.md).

# P0 — سجل التحقق الفعلي

تاريخ الفحص: 1 نوفمبر 2026، على worktrees مستقلة للفرونت والباك، بفرع `feature/individual-experience-studio-20261101`. لم يُستخدم أي حساب حقيقي أو نسخة من بيانات الإنتاج.

## عزل البيئة

- PostgreSQL 17 في حاوية `nawah-individual-db-20261101`، قاعدة `cms_test` وvolume وشبكة Docker داخلية خاصة بالمهمة. لا منفذ DB منشور ولا ربط بملفات CV الإنتاج.
- حاويات بناء/API/واجهة خاصة بالمهمة، من صور أدوات محلية موجودة، دون تنزيل deps من الإنترنت. `package-lock.json` في كل checkout طابق حزم صورة الأدوات المستخدمة؛ Node 24.
- migrations الـ31، ومنها migration الجداول الستة، طُبقت على قاعدة الاختبار الجديدة فقط. `prisma migrate status`: Database schema is up to date. `prisma validate`: valid.
- synthetic users وCV metadata وهمية؛ لا ملفات CV حقيقية. سكربت reset الموجود يرفض أي قاعدة غير cms_test مؤكدة؛ سكربت seed الجديد لا يعمل إلا مع NODE_ENV=test وINDIVIDUAL_QA_CONFIRM=SYNTHETIC_ONLY، ولا يحذف بيانات.
- Playwright استخدم Chromium محليًا مع خدمات الاختبار داخل الشبكة الخاصة. الحسابات الوهمية تسجل الدخول عبر Auth API الحقيقي وJWT وAdminGuard الحقيقيين. لا تجاوز لصلاحيات الدراسة أو ملكية الموارد في المتصفح.
- في اختبار تكامل Studio وحده عُطّل ThrottlerGuard لتعدد تسجيلات دخول fixtures؛ JWT وAdminGuard وValidationPipe وسياسات الوصول لم تُعطّل. اختبارات التكامل القديمة واختبار المتصفح تعمل بالحماية الفعلية.

## النتائج

| الفحص | التشغيل | النتيجة |
|---|---|---|
| Backend unit | `npm test -- --runInBand` | 38 suites، 228 اختبارًا، كلها ناجحة |
| Backend integration كامل | `npm run test:e2e -- --testTimeout=30000` | 9 suites، 66 اختبارًا، كلها ناجحة؛ 17 منها لـStudio |
| إعادة تحقق Studio بعد اختبار سحب الموافقة دون CV | `npm run test:e2e -- --testPathPatterns=individual-research --testTimeout=30000` | 17/17 ناجحة |
| Backend production compile | `npm run build` | ناجح |
| Prisma | validate + migrate status على cms_test | ناجح؛ SQL إضافي فقط |
| Frontend types | `npm run typecheck` | ناجح |
| Frontend production build | `npm run build` بأصل API إنتاج HTTPS للبناء فقط | ناجح؛ لم يُشغّل هذا الناتج على الإنتاج |
| Frontend regression | `node --test scripts/*checks.mjs` | 37/37 ناجحة، تشمل فحوص التصميم وروابط الوظائف والتقارير والاستقرار |
| Browser acceptance | `scripts/individual-research-browser-checks.cjs` | 17 خطوة ناجحة، دون pageerror |

كان حد bootstrap الافتراضي 5 ثوانٍ غير كافٍ عند بدء PostgreSQL/AppModule مع فحوص أخرى على نفس المضيف؛ التشغيل الكامل نجح بحد 30 ثانية، وأصبح هذا الحد صريحًا في `test/jest-e2e.json`. لا توجد assertions مُعطلة لعلاج هذا. فحوص التقارير الأمامية استمرت بنفس assertions بعد نقل fixtures لمفتاح cache المميز بنطاق التقرير، وأضيف فحص يمنع زر تحديث الأداء في VIEW حتى مع أهلية رحلة فعلية للتحديث.

## ربط متطلبات القبول بالأدلة

| المطلوب | التحقق |
|---|---|
| حالة عضو واحد لا تؤثر على غيره | snapshot المستخدم الآخر وقواعد JourneyNode قبل/بعد متطابقة |
| فتح أسبوع مبكر دون محطات | scope week:2 متاح، الأداء/أسبوع آخر 403، الإنجاز/currentNode بلا تغيير |
| Performance حقيقي | تطبيق واحد مسجل يعطي logged=1، والرسوم للقراءة دون تغيير أهلية التحديث |
| النهائي لا يكمل الرحلة | VIEW يعرض incomplete، INTERACT مرفوض، POST complete يظل 403 |
| Guidance دون قراءة وهمية | GET يفتح، مسارا POST القراءة يرفضان VIEW، FeedbackRead والتقدم لا يتغيران |
| Revoke وانتهاء الصلاحية | API يعود 403؛ واختبار Schedule/Pause/EXPIRED ومصدر NORMAL مستقل |
| API بلا تصريح | 403 لغير الأدمن/بلا قسم، 404 لأدمن خارج ACL، READ يمنع الكتابة |
| notes خاصة | Marker خاص لا يظهر في participation أو Marketing أو DomainEventLog أو DIRECT Feedback تلقائيًا |
| استمرارية الرحلة | تسجيل تطبيق عادي بعد التدخل يعمل، ولا تتغير قواعد Nodes أو التقارير السابقة |
| إعادة المحاولة | نشر Tasks/Feedback ذري، ومحاولتان متزامنتان تعطيان موردًا واحدًا، دون بريد مكرر |
| ربط الموارد | رفض مهمة/Feedback/جلسة تخص مشاركًا أو حالة أخرى |
| المتابعة والخطة | تحديث outcome/حالة دليل وخطوة DONE لا يكمل JourneyNode |
| الموافقة | Draft لا يجمع جلسات أو grants؛ رفض تغيير الغرض أو تمديد الاحتفاظ تحت موافقة سابقة |
| السحب والحذف | السحب يوقف grants، يعمل دون CV، وحذف المشارك يحذف الحالة/grants/events؛ purge ينهي الاحتفاظ دون حذف الحساب |
| اللغة/الموبايل/الكيبورد | عربي RTL وEnglish LTR، عرض 1440×1000 و390×844، لا overflow للصفحة أو تداخل مع sidebar، focus داخل Modal وEscape، prefers-reduced-motion |

## اختبار المتصفح، 17 خطوة

1. إنشاء Draft بالعربية.
2. توثيق موافقة صريحة، Active وخطوة تالية.
3. جلسة وتصريح خاص منفصل عن النص المنشور.
4. ملاحظة بحثية محددة النوع.
5. خطوة خطة خاصة والتحقق اليدوي منها.
6. نشر تدخل عبر خدمة Tasks الموجودة بتأكيد صريح.
7. منح أسبوع محدد من نموذج الإتاحة.
8. دخول العضو على تقرير الأسبوع مبكرًا دون زر إكمال أو بيانات مختلقة.
9. Guidance VIEW قابلة للإغلاق ودون زر تأكيد القراءة.
10. المهمة المرتبطة في FEATURE VIEW تعرض عناصر التعديل معطلة.
11. أدمن غير معين للحالة مرفوض في API وواجهة إنجليزية.
12. قارئ معيّن للحالة: واجهة هاتف LTR ورفض PATCH الحقيقي.
13. Mentoring يختار الشخص ورابط العودة يحافظ على الحالة.
14. focus وTab وEscape في المحرر.
15. نموذج عربي على الهاتف دون تمرير أفقي.
16. سحب الموافقة من Profile يعيد report API إلى 403.
17. بطاقة السحب تبقى ظاهرة في شاشة الاستقبال عند ملف غير مكتمل. في هذه الخطوة فقط حُوكيت استجابة readiness الأمامية؛ إنشاء الحالة والسحب وصلاحياتهما APIs حقيقية. اختبار التكامل يفحص السحب أيضًا بعد حذف CV الوهمي فعليًا.

الصور ونتائج JSON واللوجات محلية في `/data/cms/individual-experience-studio-20261101/browser-artifacts` وجذر المهمة. تثبيت الحركة في صور Playwright يمنع التقاط انتقال padding العام للشريط الجانبي في منتصفه؛ حدود العناصر اختُبرت قبل الالتقاط أيضًا.

## ما لم يُختبر وما لا يدّعيه التسليم

- لا نشر أو migration أو reset على الإنتاج، ولا SMTP فعلي أو بريد لمشارك حقيقي.
- لا متصفح هاتف مادي/Safari/Firefox؛ فحص الموبايل Chromium بأبعاد هاتف، ولا ندعي تغطية محركات أخرى.
- لا load test أو قياس أثر queries على إنتاج مزدحم؛ P0 موجه لحالات فردية قليلة، مع سجلات محدودة في كل استجابة.
- لا اختبار لاسترجاع نسخ احتياطية أو محو محتوى من backups تاريخية؛ الاحتفاظ في قاعدة التشغيل ينفذ، والنسخ الاحتياطية لها سياسة تشغيل منفصلة.
- P1: أحداث فتح الخطة وواجهة عضو لها، المقارنة الطولية، التصدير/الملخص، وربط متقدم من Inspector/Observatory.
- لا يعادل هذا موافقة إنتاج. صورة API الحية والواجهة بقيتا بنفس Image IDs وقت انتهاء التحقق: لم يُشغّل مسار اعتماد الإصدار أو GitHub نشرًا من هذا العمل.
