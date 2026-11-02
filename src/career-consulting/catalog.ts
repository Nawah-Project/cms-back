export const CONSULTING_CATALOG = {
  version: 'career-consulting-2026-11-v1',
  sources: [
    {
      id: 'dugger-process',
      author: 'Suzanne M. Dugger',
      title: 'Foundations of Career Counseling: A Case-Based Approach',
      location:
        'Chapter 9, pp. 174–181; Chapter 10, pp. 201–202; Chapter 17, pp. 389–398',
      note: {
        ar: 'مرجع لفهم الطلب واختيار المساعدة والمراجعة؛ أمثلة السوق القديمة تحتاج تحققًا حديثًا.',
        en: 'Process, matching helping strategies, and review; historical market examples require current verification.',
      },
    },
    {
      id: 'tang-process',
      author: 'Mei Tang',
      title:
        'Career Development and Counseling: Theory and Practice in a Multicultural World',
      location: 'Chapter 6, pp. 162–170; Chapter 7, assessment',
      note: {
        ar: 'العمل التشاركي والسياق وجاهزية الخطوة؛ لا نعامل التقييم كاختبار يختار مستقبل الشخص.',
        en: 'Collaboration, context, and readiness for action; assessment does not choose a person’s future.',
      },
    },
    {
      id: 'rochat-map',
      author: 'Shékina Rochat',
      title:
        'Mapping Career Counseling Interventions: A Guide for Career Practitioners',
      location: 'Introduction, pp. 6–9; chapters 4–8',
      note: {
        ar: 'صعوبة محددة ← تدخل متفق عليه ← مراجعة الفائدة، مع التكييف بحسب الشخص.',
        en: 'Identified difficulty → an agreed intervention → a review of benefit, adapted to the person.',
      },
    },
    {
      id: 'capuzzi-plan',
      author: 'David Capuzzi & Mark D. Stauffer (editors)',
      title: 'Career Counseling: Foundations, Perspectives, and Applications',
      location: 'Chapter 8, pp. 223–243',
      note: {
        ar: 'الخطة تتطور بالتجربة والمعلومات؛ النجاح لا يختزل في اختبار أو عدد مهام.',
        en: 'Plans evolve through experience and information; success is not a test result or a task count.',
      },
    },
  ],
  lessons: [
    {
      id: 'role-agreement',
      title: {
        ar: 'الدور والاتفاق على الخدمة',
        en: 'Role and working agreement',
      },
      goal: {
        ar: 'اتفق على ما تقدمه وما يحتاجه الشخص وما سيُشارك.',
        en: 'Agree on the service, the person’s needs, and what will be shared.',
      },
      body: [
        {
          ar: 'ابدأ بمساحة آمنة لسؤال الشخص وتوقعاته. وضّح دورك في تقديم معلومات ورأي مهني مبرر ومساعدة على التجربة والقرار. الشخص صاحب القرار، وله أن يختلف مع توصيتك.',
          en: 'Begin with the person’s question and expectations. Explain your role in providing information, reasoned professional advice, and support for exploration and decisions. The decision belongs to the person, who may disagree.',
        },
        {
          ar: 'حدّد غرض الخدمة وطريقة العمل والخصوصية والمدة والاحتفاظ وحق السحب بلغة مفهومة. قبول الاستشارة منفصل تمامًا عن المشاركة في بحث. لا تجعل موافقة الشخص على البحث ثمنًا للحصول على المساعدة.',
          en: 'Explain purpose, working methods, privacy, duration, retention, and withdrawal in plain language. Service consent is separate from research participation; research agreement must not be the price of receiving help.',
        },
        {
          ar: 'المساحة تساعد على الممارسة والتعلّم؛ لا تمنح مؤهلًا مهنيًا. الأنشطة الأولى نوعية وغير تشخيصية. حين تتجاوز الحاجة نطاق خبرتك، ناقش حدود الخدمة وخطوة دعم ملائمة بدل إصدار حكم أو تشخيص.',
          en: 'This workspace supports practice and learning; it does not confer a professional qualification. Initial activities are qualitative and non-diagnostic. When needs exceed your competence, discuss service boundaries and appropriate support rather than making a diagnosis.',
        },
      ],
      example: {
        ar: 'مثال تدريبي: مريم تطلب «وظيفة مناسبة». تتفقان أولًا على فهم المقصود بالمناسبة وما يمكن تحقيقه من هذه الاستشارة، دون ضمان التوظيف.',
        en: 'Training example: Mariam asks for a “suitable job.” First agree what suitable means and what this consultation can achieve, without guaranteeing employment.',
      },
      exercise: [
        {
          ar: 'اكتب شرحًا من ثلاث جمل للخدمة وحق الشخص في الاختيار والسحب.',
          en: 'Write three sentences explaining the service, choice, and withdrawal.',
        },
        {
          ar: 'حدد ما يراه الشخص وما يبقى ملاحظة داخلية.',
          en: 'Identify what the person sees and what remains an internal note.',
        },
      ],
      pitfalls: [
        {
          ar: 'بدء العمل قبل اتفاق مفهوم أو افتراض موافقة بحثية.',
          en: 'Starting before a clear agreement or assuming research consent.',
        },
        {
          ar: 'وعد بقبول وظيفي أو قرار مضمون.',
          en: 'Promising employment or a guaranteed decision.',
        },
      ],
      sources: ['dugger-process', 'tang-process'],
    },
    {
      id: 'understand-request',
      title: {
        ar: 'فهم الطلب والسياق',
        en: 'Understanding the request and context',
      },
      goal: {
        ar: 'افهم المساعدة المطلوبة قبل اختيار أداة.',
        en: 'Understand the requested help before choosing a tool.',
      },
      body: [
        {
          ar: 'احفظ سبب طلب المساعدة بكلمات الشخص: لماذا الآن، وما الذي حاول فعله، وما الذي يريد أن يتغير؟ اترك مجالًا لتصحيح فهمك بدل استبدال كلامه بتصنيف جاهز.',
          en: 'Preserve the person’s words: why now, what has been tried, and what should change? Invite corrections instead of replacing their account with a preset label.',
        },
        {
          ar: 'اسأل عما يلزم للعمل: الخبرات والتعلّم والأولويات والوقت والموارد والقيود. المعلومات اختيارية بحسب الحاجة؛ لا تطلب تاريخ حياة كاملًا أو تفاصيل شخصية غير لازمة. الدخل العاجل قد يغيّر ترتيب الأولويات.',
          en: 'Ask what is relevant: experience, learning, priorities, time, resources, and constraints. Information is gathered according to need, not as a compulsory life history. Urgent income needs may change priorities.',
        },
        {
          ar: 'ميّز بين الهدف المهني البعيد وهدف الاستشارة الحالي. قد يكون الناتج الآن تضييق بدائل أو اختبار استهداف، لا حسم الحياة المهنية كلها. اتفق على دليل واضح يُظهر أن العمل كان مفيدًا.',
          en: 'Distinguish a long-term career goal from the current consultation goal. A useful result may be narrowing options or testing targeting rather than settling an entire career. Agree how benefit will be recognised.',
        },
      ],
      example: {
        ar: 'مريم غير متأكدة من الاتجاه وتحتاج دخلًا قريبًا. قد تعملان على فرص مؤقتة مناسبة بالتوازي مع استكشاف أعمق، بدل اشتراط «المسار المثالي» أولًا.',
        en: 'Mariam is uncertain and needs income soon. Suitable short-term opportunities can be explored alongside longer-term direction rather than requiring a perfect path first.',
      },
      exercise: [
        {
          ar: 'صغ طلبًا أوليًا وهدفًا مؤقتًا ودليل فائدة يمكن ملاحظته.',
          en: 'Write a presenting concern, provisional goal, and observable evidence of benefit.',
        },
        {
          ar: 'اسأل سؤالين قد يغيران أولويتك التالية.',
          en: 'Write two questions that could change your next priority.',
        },
      ],
      pitfalls: [
        {
          ar: 'اختزال عدم التنفيذ في الكسل أو قلة الدافعية.',
          en: 'Reducing non-action to laziness or low motivation.',
        },
        {
          ar: 'اعتبار CV أو تخصص واضح شرطًا لبدء الاستكشاف.',
          en: 'Requiring a CV or clear specialism before exploration.',
        },
      ],
      sources: ['dugger-process', 'tang-process', 'capuzzi-plan'],
    },
    {
      id: 'working-understanding',
      title: {
        ar: 'بناء فهم قابل للمراجعة',
        en: 'Building a revisable understanding',
      },
      goal: {
        ar: 'اربط تفسيرك بالأدلة واحتفظ بما لا تعرفه.',
        en: 'Connect interpretations to evidence and preserve uncertainty.',
      },
      body: [
        {
          ar: 'افصل بين ما قاله الشخص، وما لاحظته، وما تشير إليه عينة عمل أو مصدر مهني، وما تستنتجه أنت. دوّن مصدر المعلومة وتاريخها وحدودها. تفسيرك ليس حقيقة بمجرد تسجيله.',
          en: 'Separate the person’s account, your observations, work samples or occupational sources, and your interpretation. Record provenance, date, and limitations. Recording an interpretation does not make it a fact.',
        },
        {
          ar: 'كوّن فهمًا عمليًا: ما الذي يعطّل الخطوة التالية، وما البدائل التفسيرية، وما المعلومة أو التجربة التي قد تغير رأيك؟ ناقش الفهم مع الشخص ودوّن اختلافه أو تصحيحه.',
          en: 'Build a working understanding: what blocks the next step, what alternative explanations exist, and what information or experience could change your view? Discuss this understanding and preserve corrections or disagreement.',
        },
        {
          ar: 'قلة الردود على التقديمات لا تثبت وحدها ضعف السيرة أو المهارات. راجع نوع الفرص والسوق والوقت والتوافق ومتطلبات الأدوار. البيانات الناقصة تبقى مجهولة؛ لا تحولها إلى أصفار أو درجات شخصية.',
          en: 'Few application responses alone do not prove a weak CV or skill deficit. Consider opportunities, market conditions, timing, fit, and role requirements. Missing information remains unknown, not zero or a personal score.',
        },
      ],
      example: {
        ar: 'عمر يستهدف تصميم المنتجات ولا يتلقى ردودًا. قبل إعادة كتابة السيرة، تراجعان عينات من الفرص والسيرة والأعمال وتضعان أكثر من تفسير قابل للتحقق.',
        en: 'Omar targets product design without responses. Before rewriting the CV, review opportunity samples, the CV, and work samples, considering more than one testable explanation.',
      },
      exercise: [
        {
          ar: 'اكتب ثلاث معلومات بمصادرها وتفسيرًا بديلًا واحدًا.',
          en: 'Record three sourced observations and one alternative explanation.',
        },
        {
          ar: 'حدد ما الذي قد يجعلك تغير توصيتك.',
          en: 'State what would make you revise your advice.',
        },
      ],
      pitfalls: [
        {
          ar: 'تقديم استنتاج سببي من عداد أو انطباع واحد.',
          en: 'Inferring causality from one count or impression.',
        },
        {
          ar: 'عرض الملاحظة الخاصة كخلاصة متفق عليها.',
          en: 'Presenting private interpretation as shared agreement.',
        },
      ],
      sources: ['tang-process', 'rochat-map'],
    },
    {
      id: 'choose-intervention',
      title: {
        ar: 'اختيار مساعدة مناسبة',
        en: 'Choosing an appropriate intervention',
      },
      goal: {
        ar: 'اختر العمل الذي يجيب عن الاحتياج الحالي.',
        en: 'Choose work that addresses the current need.',
      },
      body: [
        {
          ar: 'ابدأ من الصعوبة والهدف المتفق عليهما، ثم اسأل كيف يمكن لنشاط محدد أن يساعد. الاستكشاف أو المقارنة أو المراجعة أو التدريب وسائل مختلفة؛ المكتبة ليست وصفة واحدة للجميع.',
          en: 'Start with the agreed difficulty and goal, then ask how a particular activity could help. Exploration, comparison, review, and rehearsal serve different needs; the library is not a universal prescription.',
        },
        {
          ar: 'اشرح سبب النشاط والمخرج المتوقع والجهد المطلوب، واتفق مع الشخص على ملاءمته ووقته. عدّل الأسئلة أو أجل النشاط إن كانت الظروف لا تساعد. يمكن أن يحدث الفهم والتدخل في الجلسة نفسها.',
          en: 'Explain rationale, expected output, and effort, and agree on suitability and timing. Adapt questions or defer work when circumstances require. Understanding and intervention can develop within the same session.',
        },
        {
          ar: 'كل نشاط يُراجع بعد تنفيذه: ماذا أضاف، وما الذي لم يساعد، وما السؤال التالي؟ التسليم يثبت وقوع العمل فقط؛ لا يثبت أن الهدف تحقق.',
          en: 'Review what the activity added, what did not help, and what question comes next. Submission shows that work occurred, not that the goal was achieved.',
        },
      ],
      example: {
        ar: 'تحتاج مريم معلومات واقعية عن دورين؛ قد يفيد بحث أدوار أو حديث معلوماتي قبل مقارنة بدائل مبنية على تصورات غير مكتملة.',
        en: 'Mariam lacks realistic information about two roles; occupational exploration or an informational conversation can precede comparison of incomplete assumptions.',
      },
      exercise: [
        {
          ar: 'اختر نشاطًا واكتب لماذا يناسب الحالة ومتى لا يناسبها.',
          en: 'Choose an activity and explain when it fits and when it does not.',
        },
        {
          ar: 'اكتب مخرجًا متوقعًا وسؤال مراجعة واحدًا.',
          en: 'Write an expected output and one review question.',
        },
      ],
      pitfalls: [
        {
          ar: 'إرسال أنشطة كثيرة لأن قوالبها متاحة.',
          en: 'Assigning many activities merely because templates exist.',
        },
        {
          ar: 'فرض الانتهاء من استكشاف كامل قبل تقديم مساعدة عاجلة.',
          en: 'Demanding exhaustive exploration before providing urgent help.',
        },
      ],
      sources: ['dugger-process', 'rochat-map'],
    },
    {
      id: 'recommendation-action',
      title: {
        ar: 'التوصية وخطة العمل',
        en: 'Reasoned advice and an action plan',
      },
      goal: {
        ar: 'قدم رأيًا مهنيًا يستطيع الشخص فهمه ومراجعته.',
        en: 'Give professional advice the person can understand and question.',
      },
      body: [
        {
          ar: 'اجمع البدائل والأدلة والمفاضلات والقيود وما لم يُتحقق منه. اشرح رأيك ولماذا تفضله الآن، وما الذي قد يغيره. يمكن أن تكون التوصية جمع معلومة أو تجربة صغيرة قبل اختيار اتجاه نهائي.',
          en: 'Bring together alternatives, evidence, trade-offs, constraints, and uncertainties. Explain your current recommendation and what could change it. Advice may be to obtain information or run a small experiment before committing.',
        },
        {
          ar: 'الشخص يختار أو يطلب تعديلًا أو يؤجل القرار. تحفظ المساحة نسخ التوصية وقرار الشخص، ولا تعيد كتابة رأيه القديم عند تعديل النص. الاختلاف فرصة لفهم ما فاتنا.',
          en: 'The person can choose, request changes, or defer. Recommendation versions and decisions are preserved rather than rewriting earlier responses. Disagreement can reveal missing context.',
        },
        {
          ar: 'حوّل الاتفاق إلى خطوة محددة: ما العمل، ومن يقوم به، ومتى نراجعه، وما الدليل الذي سنناقشه؟ راعِ الموارد والوقت، وعدّل الخطة حين تظهر معلومات جديدة.',
          en: 'Turn agreement into a specific next step: what, who, review date, and evidence to discuss. Respect resources and time, revising the plan as information changes.',
        },
      ],
      example: {
        ar: 'توصية عمر: اختبار استهداف أكثر تحديدًا وعرض مشروع يوضح متطلبات الدور، مع توضيح أن قلة الردود لا تسمح بحسم السبب بعد.',
        en: 'For Omar: test more specific targeting and a work example aligned to role requirements, explaining that response counts do not yet establish the cause.',
      },
      exercise: [
        {
          ar: 'اكتب توصية وبديلًا وحدًا من حدود الأدلة.',
          en: 'Write a recommendation, one alternative, and one evidence limitation.',
        },
        {
          ar: 'حوّلها إلى خطوة يستطيع الشخص تنفيذها ومناقشة نتيجتها.',
          en: 'Translate it into an actionable and reviewable step.',
        },
      ],
      pitfalls: [
        {
          ar: 'ترشيح مهنة بدرجة تطابق مصطنعة أو يقين غير مسنود.',
          en: 'Giving an invented career-fit score or unsupported certainty.',
        },
        {
          ar: 'تغيير تخصص الحساب أو CV الشخص تلقائيًا.',
          en: 'Automatically changing the account specialism or CV.',
        },
      ],
      sources: ['capuzzi-plan', 'tang-process', 'rochat-map'],
    },
    {
      id: 'review-close',
      title: {
        ar: 'مراجعة الفائدة والإنهاء',
        en: 'Review, closure, and future use',
      },
      goal: {
        ar: 'راجع التغير مقابل هدف الاستشارة واتفق على المستقبل.',
        en: 'Review change against the consultation goal and agree future steps.',
      },
      body: [
        {
          ar: 'قارن البداية بالوضع الحالي بمشاركة الشخص: ما الذي أصبح أوضح أو تغير في القرار أو العمل؟ استخدم أقواله وعينات العمل والمعلومات المتاحة، مع فصل الملاحظة عن التفسير.',
          en: 'Compare the starting point and current position with the person: what is clearer or different in decisions or actions? Use their account, work samples, and available information, separating observation from interpretation.',
        },
        {
          ar: 'اسأل عما أفاد وما لم يفد وما بقي غير محسوم. راجع التدخل أو الهدف عند الحاجة. لا تنسب تحسنًا سببيًا للاستشارة دون دليل كافٍ، ولا تختزل المراجعة في عدد الأنشطة المكتملة.',
          en: 'Ask what helped, what did not, and what remains unresolved. Reconsider interventions or goals where appropriate. Do not infer a causal improvement without sufficient evidence or reduce review to completed tasks.',
        },
        {
          ar: 'قد ينتهي هدف الاستشارة بعد قرار أو خطة عملية بينما تظل أهداف مهنية أبعد. انشر خلاصة مفهومة وخطوات مستقبلية ومتى يطلب الشخص مساعدة إضافية، مع احترام الاحتفاظ وحق السحب.',
          en: 'The consultation goal may be achieved through a decision or practical plan while longer-term career goals remain. Publish a useful summary and future steps, including when further support may be needed, respecting retention and withdrawal.',
        },
      ],
      example: {
        ar: 'مريم تقدر الآن تشرح اختيارها وأسبابها وما تحتاج اختباره. ده قد يكون نتيجة استشارية مفيدة حتى قبل حصولها على وظيفة.',
        en: 'Mariam can explain her choice, reasons, and remaining questions. This can be a useful consultation outcome before employment.',
      },
      exercise: [
        {
          ar: 'اكتب مقارنة قبل/الآن تتضمن رأي الشخص ودليلًا وحدودًا.',
          en: 'Write a before/now review with the person’s perspective, evidence, and limitations.',
        },
        {
          ar: 'حدد خطوة مستقبلية ومتى تستدعي مراجعة إضافية.',
          en: 'Identify a future step and when further review may be useful.',
        },
      ],
      pitfalls: [
        {
          ar: 'اعتبار إنهاء الخدمة ضمانًا لتحقيق كل أهداف الحياة المهنية.',
          en: 'Treating closure as a guarantee that all career goals are achieved.',
        },
        {
          ar: 'الاستمرار في جمع أعمال جديدة بعد سحب الموافقة.',
          en: 'Collecting new work after withdrawal.',
        },
      ],
      sources: ['dugger-process', 'capuzzi-plan', 'rochat-map'],
    },
  ],
  activities: [
    {
      id: 'experience-evidence',
      title: {
        ar: 'خبرات وأدلة على القدرات',
        en: 'Experience and evidence',
      },
      purpose: {
        ar: 'استخراج أمثلة واقعية وما تعنيه للشخص.',
        en: 'Explore real examples and what they mean to the person.',
      },
      indications: {
        ar: 'حين تكون صورة الخبرة والقدرات غير واضحة.',
        en: 'When experience and abilities are unclear.',
      },
      avoid: {
        ar: 'ليس اختبار شخصية أو إثباتًا أن غياب الأمثلة يعني غياب القدرة.',
        en: 'Not a personality test; missing examples do not prove missing ability.',
      },
      expectedOutput: {
        ar: 'أمثلة ودليل وما نحتاج معرفته أكثر.',
        en: 'Examples, evidence, and remaining questions.',
      },
      fields: [
        {
          key: 'examples',
          label: {
            ar: 'مواقف واقعية وما فعلته فيها',
            en: 'Real situations and what you did',
          },
          kind: 'textarea',
        },
        {
          key: 'evidence',
          label: {
            ar: 'ما الذي يدل على الأثر؟ وما حدود الدليل؟',
            en: 'What supports the impact, and what are the limits?',
          },
          kind: 'textarea',
        },
        {
          key: 'meaning',
          label: {
            ar: 'ما الذي استمتعت به أو ترغب في تجريبه؟',
            en: 'What did you enjoy or want to try?',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'ما الذي تعلمناه عن العمل الذي يناسبك؟',
          en: 'What did we learn about suitable work?',
        },
        {
          ar: 'ما الدليل الذي ما زلنا نحتاجه؟',
          en: 'What evidence is still needed?',
        },
      ],
      sources: ['dugger-process', 'tang-process'],
    },
    {
      id: 'priorities-constraints',
      title: {
        ar: 'القيم والأولويات والقيود',
        en: 'Values, priorities, and constraints',
      },
      purpose: {
        ar: 'توضيح المفاضلات الواقعية بدل افتراض قيم الشخص.',
        en: 'Clarify real trade-offs rather than assume values.',
      },
      indications: {
        ar: 'حين تتنافس توقعات أو شروط أو احتياجات عاجلة.',
        en: 'When expectations, conditions, or urgent needs compete.',
      },
      avoid: {
        ar: 'المشاركة اختيارية؛ لا نطلب تفاصيل مالية أو عائلية غير لازمة.',
        en: 'Sharing is voluntary; unnecessary financial or family details are not required.',
      },
      expectedOutput: {
        ar: 'أولويات مرتبة وشروط مرنة أو أساسية.',
        en: 'Ranked priorities and essential or flexible conditions.',
      },
      fields: [
        {
          key: 'priorities',
          label: {
            ar: 'اكتب أولوياتك بالترتيب وأسبابها',
            en: 'List priorities in order with reasons',
          },
          kind: 'ranked',
        },
        {
          key: 'constraints',
          label: {
            ar: 'الوقت والموارد والشروط التي تريد مراعاتها',
            en: 'Time, resources, and conditions to respect',
          },
          kind: 'textarea',
        },
        {
          key: 'tradeoffs',
          label: {
            ar: 'أين تقبل المفاضلة وأين لا؟',
            en: 'Where can you compromise, and where not?',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'هل الترتيب يعبر عنك أم عن توقعات الآخرين؟',
          en: 'Does the order reflect you or others’ expectations?',
        },
      ],
      sources: ['rochat-map', 'capuzzi-plan'],
    },
    {
      id: 'role-exploration',
      title: {
        ar: 'استكشاف دور مهني',
        en: 'Occupational exploration',
      },
      purpose: {
        ar: 'سد فجوة معلومات عن واقع العمل.',
        en: 'Address an information gap about real work.',
      },
      indications: {
        ar: 'قبل استبعاد أو ترجيح دور لا نعرفه جيدًا.',
        en: 'Before favouring or rejecting a poorly understood role.',
      },
      avoid: {
        ar: 'المصدر القديم أو الأجنبي لا يمثل كل سوق؛ لا تخلط إعلانًا واحدًا بكل المهنة.',
        en: 'An old or foreign source does not represent every market; one vacancy is not an entire occupation.',
      },
      expectedOutput: {
        ar: 'مصادر مؤرخة وتفاصيل عمل وأسئلة لم تُحسم.',
        en: 'Dated sources, work details, and unresolved questions.',
      },
      fields: [
        {
          key: 'role',
          label: {
            ar: 'الدور والدولة أو السياق',
            en: 'Role and country/context',
          },
          kind: 'text',
        },
        {
          key: 'sources',
          label: {
            ar: 'مصادر المعلومات وروابطها وتاريخها',
            en: 'Sources, URLs, and dates',
          },
          kind: 'textarea',
        },
        {
          key: 'work',
          label: {
            ar: 'ما العمل اليومي ومتطلبات الدخول؟',
            en: 'Daily work and entry requirements',
          },
          kind: 'textarea',
        },
        {
          key: 'unknowns',
          label: {
            ar: 'ما الذي يحتاج سؤال ممارس أو تجربة؟',
            en: 'What needs a practitioner conversation or experience?',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'ما الذي تغير في تصورك بعد جمع المعلومات؟',
          en: 'How did your view change?',
        },
      ],
      sources: ['rochat-map', 'tang-process'],
    },
    {
      id: 'compare-options',
      title: {
        ar: 'مقارنة بدائل واتخاذ قرار',
        en: 'Compare options and decide',
      },
      purpose: {
        ar: 'المفاضلة بناء على أولويات وأدلة وحدود واضحة.',
        en: 'Compare options using priorities, evidence, and limitations.',
      },
      indications: {
        ar: 'عندما تتوافر بدائل تستحق المقارنة.',
        en: 'When there are meaningful options to compare.',
      },
      avoid: {
        ar: 'لا ننتج درجة تطابق أو نقرر نيابة عن الشخص.',
        en: 'No career-fit score or decision on the person’s behalf.',
      },
      expectedOutput: {
        ar: 'مقارنة وأسباب واختيار أو معلومة تالية لازمة.',
        en: 'Comparison, reasons, and a choice or next information need.',
      },
      fields: [
        {
          key: 'criteria',
          label: {
            ar: 'المعايير المهمة بالنسبة لك',
            en: 'Criteria that matter to you',
          },
          kind: 'ranked',
        },
        {
          key: 'comparison',
          label: {
            ar: 'البدائل والأدلة والمزايا والقيود',
            en: 'Options, evidence, benefits, and limitations',
          },
          kind: 'matrix',
        },
        {
          key: 'decision',
          label: {
            ar: 'رأيك الحالي وما قد يغيره',
            en: 'Current view and what could change it',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'هل القرار مبني على دليل كافٍ أم نحتاج تجربة صغيرة؟',
          en: 'Is the evidence sufficient or is a small experiment needed?',
        },
      ],
      sources: ['rochat-map', 'capuzzi-plan'],
    },
    {
      id: 'search-audit',
      title: {
        ar: 'مراجعة البحث عن عمل',
        en: 'Review a job search',
      },
      purpose: {
        ar: 'فهم موضع التعطل واختيار تجربة تحسين مناسبة.',
        en: 'Understand a bottleneck and choose an appropriate test.',
      },
      indications: {
        ar: 'عند وضوح هدف أولي مع نتائج بحث غير مرضية.',
        en: 'When there is an initial target but unsatisfactory search outcomes.',
      },
      avoid: {
        ar: 'العدادات لا تثبت السببية، والمعلومات الذاتية تُسجل كما هي.',
        en: 'Counts do not prove causality; self-reported information stays labelled.',
      },
      expectedOutput: {
        ar: 'صورة للاستهداف والنتائج وحدود البيانات وخطوة تحقق.',
        en: 'Targeting, outcomes, data limitations, and a verification step.',
      },
      fields: [
        {
          key: 'target',
          label: {
            ar: 'ما الأدوار والسوق والفترة التي تستهدفها؟',
            en: 'Target roles, market, and period',
          },
          kind: 'textarea',
        },
        {
          key: 'actions',
          label: {
            ar: 'ما الذي فعلته وما النتائج المتاحة؟ حدد المصدر',
            en: 'Actions, available outcomes, and their source',
          },
          kind: 'textarea',
        },
        {
          key: 'samples',
          label: {
            ar: 'أمثلة فرص وأعمال أو روابط ملائمة',
            en: 'Relevant opportunity/work samples or links',
          },
          kind: 'textarea',
        },
        {
          key: 'next-test',
          label: {
            ar: 'ما التفسيرات الممكنة وما الذي نتحقق منه تاليًا؟',
            en: 'Possible explanations and the next check',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'ما الذي نستطيع استنتاجه فعلًا، وما الذي لا نستطيع؟',
          en: 'What can and cannot be inferred?',
        },
      ],
      sources: ['dugger-process', 'tang-process'],
    },
    {
      id: 'work-review',
      title: {
        ar: 'مراجعة CV أو Portfolio',
        en: 'Review a CV or portfolio',
      },
      purpose: {
        ar: 'مراجعة مادة محددة مقابل غرض ودور ومعايير واضحة.',
        en: 'Review a specific version against a purpose, role, and criteria.',
      },
      indications: {
        ar: 'عند وجود عينة عمل مرتبطة بهدف متفق عليه.',
        en: 'When a work sample relates to an agreed goal.',
      },
      avoid: {
        ar: 'لا تفترض أن تعديل CV هو العلاج لكل تعطل؛ لا يتغير CV الحساب تلقائيًا.',
        en: 'Do not assume CV editing solves every bottleneck; the account CV is not changed automatically.',
      },
      expectedOutput: {
        ar: 'نسخة عمل وملاحظات مفسرة وتعديلات يختارها الشخص.',
        en: 'A work version, explained feedback, and chosen revisions.',
      },
      fields: [
        {
          key: 'purpose',
          label: {
            ar: 'الدور والغرض من هذه النسخة',
            en: 'Role and purpose of this version',
          },
          kind: 'text',
        },
        {
          key: 'criteria',
          label: {
            ar: 'ما المعايير التي سنراجعها؟',
            en: 'Review criteria',
          },
          kind: 'textarea',
        },
        {
          key: 'response',
          label: {
            ar: 'ما الذي تريد مراجعته وما الذي عدّلته؟',
            en: 'What needs review, and what did you revise?',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'هل أصبحت الأدلة أوضح للقارئ المستهدف؟',
          en: 'Is the evidence clearer to the intended reader?',
        },
      ],
      sources: ['dugger-process', 'capuzzi-plan'],
    },
    {
      id: 'interview-rehearsal',
      title: {
        ar: 'تحضير ومراجعة مقابلة',
        en: 'Prepare and review an interview',
      },
      purpose: {
        ar: 'تجربة شرح الخبرة ومراجعتها وفق سياق حقيقي.',
        en: 'Practise explaining experience and review it in context.',
      },
      indications: {
        ar: 'عندما تخدم المحاكاة هدفًا وظيفيًا محددًا.',
        en: 'When rehearsal serves a specific employment goal.',
      },
      avoid: {
        ar: 'لا تسجيل تلقائي ولا تحليل نفسي أو درجة قبول متوقعة.',
        en: 'No automatic recording, psychological analysis, or predicted acceptance score.',
      },
      expectedOutput: {
        ar: 'إجابة مجرّبة وتغذية راجعة وخطوة ممارسة.',
        en: 'A practised response, feedback, and a practice step.',
      },
      fields: [
        {
          key: 'context',
          label: {
            ar: 'الدور والموقف والسؤال الذي نتدرب عليه',
            en: 'Role, context, and practice question',
          },
          kind: 'textarea',
        },
        {
          key: 'answer',
          label: {
            ar: 'إجابتك أو ملخص التجربة',
            en: 'Your answer or practice summary',
          },
          kind: 'textarea',
        },
        {
          key: 'reflection',
          label: {
            ar: 'ما الذي كان واضحًا وما الذي يحتاج تحسينًا؟',
            en: 'What was clear and what needs work?',
          },
          kind: 'textarea',
        },
      ],
      review: [
        {
          ar: 'ما التحسين الذي يمكن ملاحظته في المحاولة التالية؟',
          en: 'What observable improvement can be tried next?',
        },
      ],
      sources: ['dugger-process', 'tang-process'],
    },
  ],
};
