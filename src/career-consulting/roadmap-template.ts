// Original practice aid; book locators refer to printed pages, not PDF indexes. No personal data.
export const ROADMAP_TEMPLATE = {
  version: 'consulting-roadmap-v1',
  title: {
    ar: 'من سؤال مهني إلى قرار وخطوة',
    en: 'From a career question to an informed next step',
  },
  nodes: [
    {
      id: 'prepare',
      lane: 'start',
      title: {
        ar: 'تحضيرك قبل الاستقبال',
        en: 'Prepare before intake',
      },
      aim: {
        ar: 'اقرأ المصادر كدلائل أولية، وافصل ما شاهدته عمّا استنتجته. الخريطة تحضير وليست تقييمًا للشخص.',
        en: 'Read sources as provisional evidence; separate observations from interpretations. This map is preparation, not an assessment of the person.',
      },
      questions: [
        {
          ar: 'ماذا قال الشخص بنفسه؟ وما الذي وصلنا على لسان غيره؟',
          en: 'What did the person actually say, and what was reported by someone else?',
        },
        {
          ar: 'ما الذي لم أستطع مراجعته؟ وما الذي قد يغير تصوري؟',
          en: 'What could I not review, and what might change my understanding?',
        },
      ],
      output: {
        ar: 'قائمة قصيرة: معروف، ادعاء يحتاج توضيحًا، مجهول، وأسئلة أول مقابلة.',
        en: 'A short known / claimed / unknown list and intake questions.',
      },
      gate: {
        ar: 'لا تصدر حكمًا بالبقاء أو تغيير المجال ولا تنشئ سجل مشاركة أو موافقة من هذه الخريطة.',
        en: 'Do not conclude stay or leave, or create participation or consent from this map.',
      },
      tool: {
        ar: 'من «الحالات والمتابعة» تنشئ Draft فقط بعد اختيار الحساب الصحيح عمدًا. هذه الخريطة مستقلة ولا تنشئ حالة أو تدعو صاحبها.',
        en: 'In Cases & follow-up, explicitly select the correct account before creating a Draft. This independent map creates neither a case nor an invitation.',
      },
      references: [
        'Dugger · Ch. 9, pp. 174–177',
        'Rochat · Introduction, pp. 6–9',
      ],
    },
    {
      id: 'agreement',
      lane: 'start',
      title: {
        ar: 'الاستقبال والاتفاق',
        en: 'Welcome and agree the service',
      },
      aim: {
        ar: 'وضح دورك وحدود الخدمة والخصوصية وطريقة المشاركة، ثم افهم الطلب بصوت الشخص.',
        en: 'Explain your role, service limits, privacy and shared work; hear the request in the person’s own words.',
      },
      questions: [
        {
          ar: 'ما الذي جعلك تطلب المساعدة الآن؟ وما الذي تتوقعه مني؟',
          en: 'Why seek help now, and what do you expect from me?',
        },
        {
          ar: 'ما الذي ترغب في مشاركته، وما الذي تريد إبقاءه خاصًا؟',
          en: 'What would you like to share or keep private?',
        },
      ],
      output: {
        ar: 'طلب بصوت الشخص، واتفاق مفهوم على الخدمة والاحتفاظ وحق السحب؛ موافقة البحث منفصلة.',
        en: 'The person’s request and an understandable service/retention/withdrawal agreement, independent of research consent.',
      },
      gate: {
        ar: 'دعوة الحساب الصحيح لا تعني الموافقة. يبدأ العمل الفعلي بعد قبول الشخص لاتفاق الخدمة؛ لا تسجل موافقة عنه.',
        en: 'Inviting an account is not consent. Actual work starts after the person accepts the service agreement; never accept on their behalf.',
      },
      tool: {
        ar: 'داخل الحالة: الإتاحة والاتفاق → دعوة؛ يقبل الشخص من «استشارتي المهنية». لا تربط Journey أو CV الحساب إلا بطلب مشاركة صريح من الشخص.',
        en: 'In the case: Access & agreement → Invite; the person accepts in My career consultation. Programme/CV sharing requires their explicit opt-in.',
      },
      references: ['Dugger · Ch. 9, pp. 174–177', 'Tang · Ch. 6, pp. 162–163'],
    },
    {
      id: 'question',
      lane: 'start',
      title: {
        ar: 'ما القرار الذي نساعد فيه؟',
        en: 'Define the question and benefit',
      },
      aim: {
        ar: 'افصل عدم الرغبة في العمل نفسه عن تعطل البحث أو شروط العمل. الهدف قابل للمراجعة.',
        en: 'Separate dislike of the work itself from search barriers or unacceptable work conditions. The goal can change.',
      },
      questions: [
        {
          ar: 'لو ظهرت غدًا وظيفة UX مناسبة بشروط مقبولة، هل تختارها؟ ولماذا؟',
          en: 'If a suitable UX job with acceptable conditions appeared tomorrow, would you choose it? Why?',
        },
        {
          ar: 'ما الذي لو اتضح بنهاية الاستشارة ستعتبرها مفيدة؟',
          en: 'What becoming clearer would make the consultation useful?',
        },
      ],
      output: {
        ar: 'سؤال عمل مؤقت ودليل استفادة: مثل تمييز سبب التردد واختيار خطوة تستند لأدلة.',
        en: 'A provisional question and evidence of benefit, such as understanding the uncertainty and choosing an evidence-informed next step.',
      },
      gate: {
        ar: 'لا تختزل النجاح في الحصول على وظيفة أو إكمال نشاط. اختر المسار الأكثر إلحاحًا أو افتح المسارين بالتوازي.',
        en: 'Success is not simply a job offer or completed activity. Prioritise the urgent path or explore both in parallel.',
      },
      tool: {
        ar: 'النظرة العامة → مادة «اتفاق واتجاه العمل»: الطلب والهدف ودليل الاستفادة والسياق والخطوة التالية ومن ينتظر من. احفظ المسودة ثم شارك الخلاصة المتفق عليها فقط.',
        en: 'Overview → Working agreement material: concern, goal, benefit criteria, context, next step and next actor. Save a draft; publish only the agreed summary.',
      },
      references: ['Tang · Ch. 6, pp. 163–167', 'Dugger · Ch. 10, pp. 203–213'],
    },
    {
      id: 'self',
      lane: 'explore',
      title: {
        ar: 'أ · علاقتها بعمل UX',
        en: 'A · Explore the work itself',
      },
      aim: {
        ar: 'استخدم خبرات حقيقية لفهم المهام التي ترغب فيها والقيم والقيود؛ بلا اختبار شخصية أو تشخيص.',
        en: 'Use concrete experiences to understand preferred tasks, values and constraints, without personality tests or diagnosis.',
      },
      questions: [
        {
          ar: 'احكي موقفين أو ثلاثة: ماذا فعلت بنفسك؟ وما الذي منحك طاقة أو استنزفك؟',
          en: 'Describe two or three episodes: what did you do yourself, and what energised or drained you?',
        },
        {
          ar: 'هل الرفض للبحث، للتصميم، لبيئة بعينها، أم للمجال كله؟ وما الشروط الأساسية والمرنة؟',
          en: 'Is the dislike about research, design, a particular setting, or the whole field? Which conditions are essential or flexible?',
        },
      ],
      output: {
        ar: 'أمثلة عمل وأولويات مرتبة وشروط مهمة، مع ما يحتاج تجربة بدل حكم نهائي.',
        en: 'Work examples, ordered priorities, key conditions, and questions needing experience rather than a verdict.',
      },
      gate: {
        ar: 'إن لم توجد خبرة كافية، اختر تجربة صغيرة أو حديثًا معلوماتيًا؛ غياب المثال لا يثبت غياب القدرة أو الاهتمام.',
        en: 'When experience is limited, choose a small trial or informational conversation; a missing example does not prove missing ability or interest.',
      },
      tool: {
        ar: 'الأنشطة → اختر «خبرات وأدلة» أو «القيم والأولويات والقيود»، مع سبب واضح. انشر نشاطًا واحدًا مناسبًا، ثم راجع نسخة التسليم المحددة.',
        en: 'Activities → choose Experience & evidence or Priorities & constraints with a reason. Publish one suitable activity and review its exact submitted version.',
      },
      references: [
        'Rochat · Ch. 5, §§5.1, 5.3–5.4, pp. 94–108',
        'Tang · Ch. 6, pp. 164–166',
      ],
    },
    {
      id: 'market',
      lane: 'explore',
      title: {
        ar: 'ب · البحث والسوق والشروط',
        en: 'B · Search, market and eligibility',
      },
      aim: {
        ar: 'حلل أين يتعطل البحث، وافصل مستوى الدور والموقع والأهلية عن جودة العرض وعن الرغبة في المجال.',
        en: 'Locate the search bottleneck; distinguish level, location and eligibility from evidence presentation and interest in the work.',
      },
      questions: [
        {
          ar: 'ما الأدوار والمدن ونمط العمل والفترة؟ ما عدد الطلبات الملائمة والردود والمقابلات، وما مصدر الأرقام؟',
          en: 'Which roles, cities, work patterns and dates? What suitable applications, responses and interviews exist, and how were they counted?',
        },
        {
          ar: 'هل الفرصة فعلًا مفتوحة؟ وهل المستوى والأهلية وشروط الانتقال تنطبق؟ ما الذي يحتاج تأكيد صاحب العمل؟',
          en: 'Is the role actually open? Do level, eligibility and mobility conditions fit? What requires employer confirmation?',
        },
      ],
      output: {
        ar: 'عينة مؤرخة من إعلانات أصلية، وسجل بحث محدود الفترة، وفجوات معلومات. الإعلان المغلق معيار متطلبات وليس فرصة متاحة.',
        en: 'A dated sample of original listings, a time-bounded search record and information gaps. Closed ads indicate requirements, not available leads.',
      },
      gate: {
        ar: 'العينة لا تمثل كل السوق. لا تستنتج فرصة توظيف أو راتبًا أو ملاءمة شخص من نمو الاقتصاد أو من إعلان Senior.',
        en: 'The sample is not the whole market. Do not infer hiring odds, salary or personal fit from economic growth or senior vacancies.',
      },
      tool: {
        ar: 'الأنشطة → «مراجعة البحث عن عمل» و«استكشاف دور» عند الحاجة. الأدلة → احفظ الرابط والتاريخ والدولة وحالة الإعلان وما لم يُتحقق منه؛ لا تنسخ معلومات قديمة كواقع حالي.',
        en: 'Activities → Search audit and, if needed, Role exploration. Evidence → record URL, date, country, listing status and unknowns; do not treat old information as current.',
      },
      references: [
        'Rochat · Ch. 6, §§6.1–6.4, pp. 124–133',
        'Tang · Ch. 6, p. 166',
      ],
    },
    {
      id: 'understand',
      lane: 'synthesise',
      title: {
        ar: 'نبني فهمًا مشتركًا',
        en: 'Build a shared understanding',
      },
      aim: {
        ar: 'اجمع المسارين كاحتمالات مرتبطة بأدلة، ثم صحح الفهم مع الشخص قبل اختيار المساعدة.',
        en: 'Bring both paths together as evidence-linked possibilities and check your understanding with the person before intervening.',
      },
      questions: [
        {
          ar: 'ما الذي نعرفه؟ وما الذي هو قول أو تفسير أو سؤال مفتوح؟',
          en: 'What is observed, reported, interpreted, or still unknown?',
        },
        {
          ar: 'هل المشكلة أقرب لاتجاه العمل، الاستهداف، عرض الأدلة، شروط السوق، أم أكثر من عامل؟',
          en: 'Is this chiefly direction, targeting, evidence presentation, market constraints, or several factors?',
        },
      ],
      output: {
        ar: 'صياغة عمل قصيرة، وأولوية واحدة، ومعلومة قد تغيرها. لا تساوي بين الادعاء والدليل.',
        en: 'A short working formulation, one priority, and information that could change it. A claim is not the same as evidence.',
      },
      gate: {
        ar: 'إذا اعترض الشخص أو بقي الدليل ضعيفًا، ارجع للمسار المعني بدل الدفاع عن تفسيرك.',
        en: 'If the person disagrees or evidence is weak, revisit the relevant path rather than defend your interpretation.',
      },
      tool: {
        ar: 'الأدلة تحفظ الملاحظات ومصدرها؛ ملاحظاتك الداخلية تظل خاصة. حدّث الهدف في مادة العمل وانشر ملخصًا يفهمه الشخص؛ الفرضيات ليست حقائق منشورة تلقائيًا.',
        en: 'Evidence retains observations and sources; your internal notes stay private. Update the working material and publish an understandable summary; hypotheses are not auto-published facts.',
      },
      references: [
        'Dugger · Ch. 9, pp. 177–181',
        'Rochat · Introduction, pp. 6–9',
      ],
    },
    {
      id: 'choose',
      lane: 'test',
      title: {
        ar: 'نختار المساعدة لسبب',
        en: 'Choose one purposeful intervention',
      },
      aim: {
        ar: 'حدد ما نريد تعلمه قبل اختيار النشاط. لا ترسل المكتبة كلها.',
        en: 'Decide what we need to learn before choosing an activity. Do not assign the whole library.',
      },
      questions: [
        {
          ar: 'ما السؤال الأهم الآن؟ ولماذا هذا النشاط أفضل من بديل أبسط؟',
          en: 'What is the priority question, and why is this activity better than a simpler alternative?',
        },
        {
          ar: 'ما المخرج المفيد؟ ومتى نراجعه؟ وما الذي لن يثبته؟',
          en: 'What useful output do we expect, when will we review it, and what will it not prove?',
        },
      ],
      output: {
        ar: 'نشاط واحد أو تجربة صغيرة متفق عليها: الغرض، العمل، المخرج، الحدود، وموعد مرن للمراجعة.',
        en: 'One agreed activity or small experiment: purpose, action, output, limits and a flexible review date.',
      },
      gate: {
        ar: 'لو العمل عاجل، يمكن معالجة احتياج فوري مع إبقاء سؤال الاتجاه مفتوحًا. الوقت والموارد يحددهما الشخص معك.',
        en: 'Urgent practical needs can be addressed while direction remains open. Agree scope and resources with the person.',
      },
      tool: {
        ar: 'الأنشطة → اختر القالب وعدّل الأسئلة وسبب الاختيار والمخرج. الجلسات → هدف وأجندة ومواد وموعد ورابط اختياري. حفظ المسودة لا ينشرها.',
        en: 'Activities → adapt the template, questions, rationale and output. Sessions → goal, agenda, materials, time and optional meeting link. Saving a draft does not publish it.',
      },
      references: [
        'Rochat · Introduction, pp. 6–9',
        'Dugger · Ch. 9, pp. 177–181',
      ],
    },
    {
      id: 'ux-test',
      lane: 'experiment',
      title: {
        ar: 'تجربة UX أو البحث',
        en: 'Test UX work or the search',
      },
      aim: {
        ar: 'إن كانت الرغبة في UX موجودة، اختبر فرضية محددة عن العمل أو عرض الأدلة أو الاستهداف.',
        en: 'If interest in UX remains, test a specific hypothesis about the work, evidence presentation or targeting.',
      },
      questions: [
        {
          ar: 'هل عرض مشروع واحد يوضح المشكلة والقرار والدليل والدور؟ أين نحتاج تحققًا من الأثر؟',
          en: 'Does one case explain the problem, decisions, evidence and personal contribution? Which impact claims need verification?',
        },
        {
          ar: 'هل نختبر استهداف فرص ملائمة فعلًا أو محاكاة شرح المشروع؟',
          en: 'Should we test genuinely suitable targeting or rehearse explaining the project?',
        },
      ],
      output: {
        ar: 'نسخة مشروع أو شرح مجرّب أو مجموعة تقديم محدودة وملائمة، مع مصدر الملاحظات والنتائج.',
        en: 'A revised case, rehearsed explanation, or limited suitable application test, with traceable feedback and outcomes.',
      },
      gate: {
        ar: 'عدم الرد وحده لا يثبت فشل المجال أو أن CV السبب. لا تحول النموذج الأولي إلى ادعاء منتج منشور.',
        en: 'No response alone proves neither career failure nor a CV problem. Do not present prototypes as shipped products.',
      },
      tool: {
        ar: '«مراجعة CV/Portfolio» أو «مراجعة البحث» أو «التحضير للمقابلة» بحسب الفرضية؛ تسليم ملف العمل مستقل عن CV الحساب. علّق على النسخة المرسلة نفسها.',
        en: 'Use Work review, Search audit or Interview rehearsal according to the hypothesis. Work files are independent of the account CV. Review the exact submitted version.',
      },
      references: [
        'Tang · Ch. 6, pp. 167–170',
        'Capuzzi & Stauffer · Ch. 8, pp. 223–243',
      ],
    },
    {
      id: 'alternative-test',
      lane: 'experiment',
      title: {
        ar: 'تجربة بديل تختاره هي',
        en: 'Explore a person-chosen alternative',
      },
      aim: {
        ar: 'إن كانت تميل لترك نوع العمل، اختبر بديلًا واقعيًا قبل قرار مكلف. لا ترشح مهنة من تخمين شخصي.',
        en: 'If the work itself is unattractive, explore a realistic alternative before a costly commitment. Do not prescribe a career from a guess.',
      },
      questions: [
        {
          ar: 'ما البديل الذي يهمك، وما الذي تعرفينه عن يوم العمل فيه؟',
          en: 'Which alternative interests you, and what do you know about its working day?',
        },
        {
          ar: 'هل يمكن حديث معلوماتي أو مهمة صغيرة أو ملاحظة عمل دون التزام بتدريب مكلف؟',
          en: 'Could an informational conversation, small task or work observation test it before expensive training?',
        },
      ],
      output: {
        ar: 'خبرة أو معلومة جديدة عن بديل اختارته، وما أعجبها أو لم يناسبها، وتكلفة وشروط الانتقال.',
        en: 'New experience or information about her chosen alternative, preferences, and transition costs and conditions.',
      },
      gate: {
        ar: 'يمكن اختيار جسر دخل مؤقت أو تأجيل قرار الاتجاه إذا كانت القيود أولوية؛ لا نفترض أن الهندسة أو UI هي البديل المناسب.',
        en: 'A temporary income bridge or deferred direction decision can be valid when constraints dominate; do not assume engineering or UI is the right alternative.',
      },
      tool: {
        ar: '«استكشاف دور» ثم «خبرات وأدلة» إن كان مناسبًا؛ احفظ أسئلة التجربة ومصدر المعلومات، ولا تغيّر تخصص الحساب أو تقدم Journey.',
        en: 'Role exploration, then Experience & evidence when useful. Save the experiment’s questions and sources; do not change account specialisation or Journey progress.',
      },
      references: [
        'Rochat · Ch. 7, §§7.4–7.7, pp. 151–160',
        'Capuzzi & Stauffer · Ch. 8, pp. 223–243',
      ],
    },
    {
      id: 'review',
      lane: 'review',
      title: {
        ar: 'ماذا تعلمنا من التجربة؟',
        en: 'Review what changed',
      },
      aim: {
        ar: 'راجع الفائدة مع الشخص لا اكتمال المهمة فقط؛ التجربة قد تغير فهمك أو هدفه.',
        en: 'Review benefit with the person, not task completion alone; the experiment may change your understanding or their goal.',
      },
      questions: [
        {
          ar: 'ما الذي أصبح أوضح؟ وما الدليل وما تفسيره البديل؟',
          en: 'What became clearer, what supports it, and what alternative explanation remains?',
        },
        {
          ar: 'ما الذي لم يفد؟ نكرر بطريقة أخرى أم نغير السؤال؟',
          en: 'What was unhelpful? Should we try differently or change the question?',
        },
      ],
      output: {
        ar: 'مراجعة مرتبطة بنسخة العمل، وما تغير وما لم يُحسم، والخطوة التالية ومن يقوم بها.',
        en: 'A version-specific review, what changed, remaining uncertainties, and the next action and owner.',
      },
      gate: {
        ar: 'دليل غير كافٍ → ارجع للاستكشاف أو اختر تجربة أصغر؛ دليل مفيد → قارن البدائل.',
        en: 'Insufficient evidence → revisit exploration or try a smaller test; useful evidence → compare options.',
      },
      tool: {
        ar: 'افتح التسليم → مراجعة نسخته وخطوته التالية. تحديث مادة العمل/الهدف لا يمحو النشر السابق؛ لا تعد النشاط المجاب عنه كإثبات نجاح مهني.',
        en: 'Open the submission → review that version and its next step. Updating work/goals does not rewrite past publications; completing an activity is not proof of career success.',
      },
      references: [
        'Rochat · Introduction, pp. 8–9',
        'Tang · Ch. 6, pp. 168–170',
      ],
    },
    {
      id: 'decide',
      lane: 'decision',
      title: {
        ar: 'توصية مبررة وقرارها',
        en: 'Recommend; the person decides',
      },
      aim: {
        ar: 'قارن بدائل حقيقية بمعاييرها هي، واشرح رأيك وأسبابه وحدوده وما قد يغيره.',
        en: 'Compare real options against the person’s own criteria. Explain your recommendation, reasons, limits and what could change it.',
      },
      questions: [
        {
          ar: 'UX في شروط مختلفة، بديل مختار، أو جسر مؤقت: ما الأدلة والمفاضلات؟',
          en: 'UX under different conditions, a chosen alternative, or a temporary bridge: what evidence and trade-offs exist?',
        },
        {
          ar: 'ما الذي تختارينه الآن؟ وهل تريدين تعديلًا أو تأجيل القرار؟',
          en: 'What do you choose now, and do you want a change or time to defer?',
        },
      ],
      output: {
        ar: 'توصية وبدائل وأدلة وحدود، ثم قرار الشخص أو طلبه للتعديل أو التأجيل.',
        en: 'A recommendation with alternatives, evidence and limits, followed by the person’s decision, requested change or deferral.',
      },
      gate: {
        ar: 'لا درجات ملاءمة مختلقة ولا نسب توظيف. اعتراضها يعيدنا للفهم، ولا يُسجل قبول بلا فعل صريح منها.',
        en: 'No invented fit scores or hiring probabilities. Disagreement reopens understanding; acceptance requires their explicit action.',
      },
      tool: {
        ar: '«مقارنة البدائل» ثم «التوصيات» → مسودة → نشر؛ الشخص يختار موافقة/طلب تعديل/تأجيل. شارك التوصية فقط بعد مراجعة ملاحظاتك الخاصة.',
        en: 'Compare options → Recommendations → draft → publish; the person chooses proceed/change/defer. Review private notes before sharing the recommendation.',
      },
      references: [
        'Rochat · Ch. 4, §§4.2–4.5, pp. 76–85',
        'Capuzzi & Stauffer · Ch. 8, pp. 223–243',
      ],
    },
    {
      id: 'followup',
      lane: 'finish',
      title: {
        ar: 'خطة ومراجعة وإنهاء',
        en: 'Act, follow up and close',
      },
      aim: {
        ar: 'حوّل الاختيار لخطوة قابلة للتنفيذ، وراجع التغير مقابل هدف البداية؛ يمكن العودة لاحقًا.',
        en: 'Turn the choice into feasible action and review change against the original goal; returning later remains possible.',
      },
      questions: [
        {
          ar: 'من يفعل ماذا ومتى؟ ما الحد الذي يستدعي تغيير الخطة؟',
          en: 'Who does what, by when? What would require changing the plan?',
        },
        {
          ar: 'ماذا كان قبل/الآن من وجهة نظرك؟ وما الذي ستفعلينه لو عاد التعطل؟',
          en: 'What was different before/now from your perspective? What will you do if progress stalls again?',
        },
      ],
      output: {
        ar: 'خطة متفق عليها، مراجعة منفعة وحدود، خلاصة ختامية وخطوات مستقبلية وموعد مراجعة عند الحاجة.',
        en: 'An agreed plan, review of benefit and limits, closure summary, future steps and follow-up when needed.',
      },
      gate: {
        ar: 'انتهاء الاستشارة لا يضمن وظيفة. إذا سُحبت الموافقة يتوقف العمل الجديد مع تطبيق الاحتفاظ، ولا يتغير Journey.',
        en: 'Closing consultation does not guarantee a job. Withdrawal stops new work under retention rules without changing Journey.',
      },
      tool: {
        ar: 'مادة العمل → الخطوة التالية/من ينتظر من/قبل والآن/خطوات مستقبلية؛ انشر الخلاصة ثم أكمل الحالة. استخدم إيقاف/سحب الاتفاق عند الحاجة، وليس حذف السجل لإخفاء التردد.',
        en: 'Work material → next action/actor/before-now/future steps; publish the summary then complete the case. Pause/withdraw when needed rather than erase uncertainty.',
      },
      references: [
        'Dugger · Ch. 9, p. 181',
        'Tang · Ch. 6, p. 170',
        'Capuzzi & Stauffer · Ch. 8, pp. 223–243',
      ],
    },
  ],
  edges: [
    {
      from: 'prepare',
      to: 'agreement',
      return: false,
    },
    {
      from: 'agreement',
      to: 'question',
      return: false,
    },
    {
      from: 'question',
      to: 'self',
      return: false,
    },
    {
      from: 'question',
      to: 'market',
      return: false,
    },
    {
      from: 'self',
      to: 'understand',
      return: false,
    },
    {
      from: 'market',
      to: 'understand',
      return: false,
    },
    {
      from: 'understand',
      to: 'choose',
      return: false,
    },
    {
      from: 'choose',
      to: 'ux-test',
      return: false,
    },
    {
      from: 'choose',
      to: 'alternative-test',
      return: false,
    },
    {
      from: 'ux-test',
      to: 'review',
      return: false,
    },
    {
      from: 'alternative-test',
      to: 'review',
      return: false,
    },
    {
      from: 'review',
      to: 'decide',
      return: false,
    },
    {
      from: 'decide',
      to: 'followup',
      return: false,
    },
    {
      from: 'review',
      to: 'understand',
      return: true,
    },
    {
      from: 'decide',
      to: 'self',
      return: true,
    },
  ],
  session: [
    {
      ar: 'افتتاح واتفاق: لماذا الآن؟ ما الخدمة وما حدودها؟',
      en: 'Opening and agreement: why now, what service and limits?',
    },
    {
      ar: 'الطلب والهدف: افهم السؤال بلغتها ودليل الفائدة المنتظر.',
      en: 'Request and goal: understand the question in her words and the expected benefit.',
    },
    {
      ar: 'أمثلة وسياق: موقفان أو ثلاثة من العمل، وشروط السوق والحياة ذات الصلة فقط.',
      en: 'Examples and context: two or three work episodes and only relevant market/life conditions.',
    },
    {
      ar: 'تلخيص ومراجعة: اسألها ما الذي فهمته خطأ، واتفقا على سؤال واحد وخطوة جمع دليل.',
      en: 'Summarise and check: ask what you misunderstood, then agree one question and evidence-gathering step.',
    },
  ],
} as const;
