# نواة — Manual QA قبل الـpilot

الحالة: **لسه ما اتنفّذتش على متصفح**. مفيش browser automation أو Chromium/Firefox متاحين في بيئة التنفيذ. اختبارات SSR وHTTP مش بديل عن الفحص ده. استخدم deployment اختبار منفصل وaccounts صناعية، وSMTP test inbox، وCVs صناعية؛ ما تستخدمش production.

## مصفوفة الفحص

كرر كل بند على `390×844` و`1440×900`، مرة Arabic RTL ومرة English LTR. سجّل لكل run: browser/version، commit IDs للباك والفرونت، viewport، اللغة، PASS/FAIL، وscreenshot لأي عيب. جرّب light/dark في القوائم والمودالات الأساسية، ومع تكبير النص 200%.

## الشاشات والخطوات والنتيجة المطلوبة

- [ ] `/auth/register`: بيانات سليمة/خاطئة، duplicate email، password error، طلب واحد رغم double click. فشل إرسال SMTP بعد إنشاء الحساب ينقلك لصفحة OTP بحساب pending ورسالة delivery failure؛ مفيش نجاح إرسال وهمي ولا طلب تسجيل من جديد.
- [ ] OTP: Tab بين الست خانات، لصق كود كامل، Backspace، كود غلط/منتهي، cooldown، resend ناجحة وفاشلة، تغيير البريد والخروج. النجاح ينقل لبوابة البروفايل؛ الفشل يحتفظ بإمكانية المحاولة.
- [ ] `/profile` وبوابة الإكمال: كتابة الاسم والتخصص والـportfolio، اختيار تخصص بالـArrowUp/Down وEnter وEscape، حفظ وفشل حفظ/retry؛ مفيش فقد للنص. رسائل عربية/إنجليزية مفهومة. رفع PDF سليم ورفض DOCX أو ملف غير PDF؛ preview وتحميل CV الحالي والتاريخ.
- [ ] `/applications`: first-application tour تظهر للمستخدم الجديد بعد الإكمال، Next/Back/Skip/Close بالكيبورد، لا تغطي الحقول أو تخرج بره الموبايل. حفظ أول طلب، إعادة فتحه وتعديله. كل primary CTAs واضحة ومفيش scroll أفقي غير داخل الجدول المخصص.
- [ ] المهمة صفر: إضافة 5 طلبات بالواجهة؛ refresh يثبت التقدم. المجموعة والإرشاد الأول يتفتحوا؛ لوحة المهام المهنية تفضل مقفولة. اختبار طلب رحلة فاشل من DevTools يطلع retry بدل skeleton مستمرة.
- [ ] خريطة الرحلة: current/completed/locked مختلفة وواضحة؛ future week الرسالة عن المتطلبات مش تاريخ مخترع. مستخدم سريع، ومستخدم راجع متأخر؛ الـdate والـCTA لا يناقضوا الحالة المحفوظة. time fixture على DB الاختبار فقط.
- [ ] إرشادات `/professional-development`: فتح card بالـTab/Enter، قراءة ومصادر وروابط AI prompt وCopy، الحفظ أثناء network error ما يعلنش نجاح. reload وrelogin يثبتوا read state. المقالات اللي كتبها الأدمن بتفضل بلغتها الأصلية؛ واجهة التحكم بلغة المستخدم. Escape يقفل وfocus يرجع للزر؛ Tab ما يهربش من modal.
- [ ] Review الأسبوع: كتابة reflection، رفع CV اختياري لا يقفل reflection وحده، حفظ حقيقي ينقل للمهمة التالية. double click/retry لا يعمل rows إضافية؛ فشل API يحتفظ بالكلام.
- [ ] Week2 tailored applications، Week3 posts مختلفة متتابعة، وقراءة Time Management؛ بعدها task nav/API يشتغلوا. TasksPage أثناء journey API error تعرض retry. إنشاء مهمة وتعديلها وتغيير حالتها بالكيبورد، بديل لعمليات drag/drop؛ loading/empty/error صحيحة.
- [ ] Week4 outreach: required fields ورسالة ownership، حفظ عدة اتصالات مختلفة، retry نفس الاتصال. LinkedIn URLs والملاحظات لا تكسر عرض الموبايل.
- [ ] `/reports`: كل tabs بما فيها التفعيل والرحلة بالكامل؛ no data وsmall sample وunknown history؛ weekly comparison مفهومة. الرسم actual dates مستقل عن cohort tabs؛ قائمة الأرقام متاحة بالكيبورد. report API failure/retry، وسجل CV والمراجعات والتغييرات؛ فشل حفظ change يحتفظ بالنص. التغيير المهني الخاص لا يظهر في feed المجموعة.
- [ ] Final report: بعد كل predecessor فقط؛ رابط الخريطة يفتح التقرير الكامل، تأكيد الإكمال يفضل بعد reload/relogin، تكراره آمن، والأدمن يرى completed بعد التأكيد فقط. واضح إن تقرير الأسبوع الرابع مختلف عن ملخص الرحلة كلها.
- [ ] `/members-progress`: نفس المجموعة تظهر تقدم الأعضاء وCV/portfolio حسب سياسة المجموعة؛ employer/title/URL الخاصة مش ظاهرة في feed ولا detail. بعد مشاركة صريحة تظهر الفرصة. عضو من مجموعة تانية لا يقرأ detail أو CV. مفيش CTA لإعادة استخدام فرصة غير مشاركة.
- [ ] Notifications: القراءة والـmark-all حقيقيين، API failure ما يزوّدش نجاح وهمي؛ لا toggle email preference وهمية. modal/dropdown داخل الشاشة، ويمكن إغلاقها بالكيبورد.
- [ ] Logout A → Login B بدون reload، ومع request قديمة معلقة: لا تقرير/اسم/تنبيه/ملاحظات أو modal تخص A تظهر لـB. إعادة التجربة بعد session expiration، وعند network failure في logout؛ محتوى A يختفي محليًا.
- [ ] Admin community: عرض العضو، إزالة عضوية بعد ConfirmDialog وcancel؛ pending يمنع الضغط المتكرر وfailure واضحة. assign task لعضو ولمجموعة، تحرير توجيه ونشره، monitor journey/final classification؛ OTP logs محجوبة ولا retry لرسالة تحقق قديمة.

## التوقيع

ما تعلمش أي checkbox إلا بعد تنفيذها فعليًا. أي عيب يمنع التقدم أو يعرض بيانات حساب تاني أو يعلن حفظ وهمي يمنع دعوة المستخدمين لحد الإصلاح وإعادة الفحص. اربط screenshots والـretest بالتذكرة/التقرير؛ مفيش screenshots اتولّدت ضمن التنفيذ الحالي.
