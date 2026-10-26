# Nawah — Visual Acceptance Checklist

**الفرع:** `restoration/performance-analytics`  
**المرجع المتاح:** React history قبل `2da16dd`. ملفات HTML المشار إليها غير متاحة في جلسة التنفيذ.  
**حالة الفحص الآن:** لم يبدأ التحقق المرئي؛ لا توجد Browser automation في هذه الجلسة.

استخدم البيانات الصناعية فقط في preview/بيئة معزولة. سجّل النتيجة واسم screenshot لكل صف. ممنوع تغيير journey progress الحقيقي لمحاكاة الأسابيع المستقبلية.

| الحالة | Desktop 1440×900 | Mobile 390×844 | Arabic RTL | English LTR | النتيجة / screenshot |
|---|---|---|---|---|---|
| رحلة بلا applications ولا CV history | ☐ | ☐ | ☐ | ☐ | |
| خمس applications بمراحل ونتائج متعددة | ☐ | ☐ | ☐ | ☐ | |
| transition تاريخي متأخر ونتيجة رفض/انسحاب/بلا رد | ☐ | ☐ | ☐ | ☐ | |
| CV versions متعددة مع timestamps فعلية | ☐ | ☐ | ☐ | ☐ | |
| USER_CHANGE منفصل عن weekly reflection | ☐ | ☐ | ☐ | ☐ | |
| chart: فترة/تراكمي، الحجم/الاستجابة، tooltips وdata alternative | ☐ | ☐ | ☐ | ☐ | |
| current stage distribution والنتائج النهائية منفصلان | ☐ | ☐ | ☐ | ☐ | |
| change periods مع sample counts وتحذير عدم السببية | ☐ | ☐ | ☐ | ☐ | |
| تقرير أسبوع متاح بعد تحقق شرطه | ☐ | ☐ | ☐ | ☐ | |
| تقرير أسبوع مقفول، وسبب القفل مفهوم بلا كشف محتوى مستقبلي | ☐ | ☐ | ☐ | ☐ | |
| Final Report منفصل عن Week 4 والإقرار يعمل للمستخدم فقط | ☐ | ☐ | ☐ | ☐ | |
| Admin Preview DEMO وACTUAL يظلان read-only ومحميين | ☐ | ☐ | ☐ | ☐ | |
| keyboard focus، overflow، modal/popover placement، labels | ☐ | ☐ | ☐ | ☐ | |

## معايير القبول

- التحليلات الشاملة تظل ظاهرة للمستخدم قبل فتح تقارير الأسابيع.
- الـmaster chart مرئي وقابل للفهم، والـsummary مصاحب له على desktop ويترتب رأسيًا على الهاتف بلا overflow أفقي.
- current stage وfinal outcome وhistorical transition milestones لا تندمج في donut أو نسبة واحدة مضللة.
- كل نقطة تغيير على الرسم مرتبطة بتاريخ CV أو `USER_CHANGE` محفوظ. لا يوجد baseline أو change اصطناعي.
- low sample/empty states تشرح حدود البيانات ولا تستنتج سببًا.
- تبويبات الأسابيع المقفولة تشرح الحالة ولا تعرض بيانات أسبوع مستقبلي؛ Week 4 وFinal Report واضحان كشيئين مختلفين.
- Arabic/English labels وRTL/LTR ومحاذاة legend/tooltips تعمل، والـchart له بديل بيانات accessible.
- Admin preview لا يظهر أفعال إكمال أو تغيير بيانات.

## نتيجة التحقق

- Browser / automation: **غير متاح وقت التنفيذ**.
- Screenshots: **لا توجد**.
- اختبارات SSR الآلية: **9 ناجحة**؛ تغطي empty/populated markup، lock states، فصل الأسبوع عن النهائي، وread-only preview. ده مش فحص بصري أو keyboard interaction.
- حالة التحقق: تبقى unchecked إلى أن تُراجع داخل Browser حقيقي بعد تجهيز fixtures معزولة؛ نجاح build وحده لا يعتبر تحققًا بصريًا.
