export interface JourneyGuidanceSeedItem {
  code: string;
  weekNumber: number;
  isAdvanced?: boolean;
  titleAr: string;
  titleEn: string;
  contentAr?: string;
  contentEn?: string;
  summaryAr: string;
  summaryEn: string;
  promptTemplateAr: string;
  promptTemplateEn: string;
}

export const JOURNEY_GUIDANCE_CATALOG: JourneyGuidanceSeedItem[] = [
  {
    "code": "INSIGHT_TASK_0_CV_BASE",
    "weekNumber": 0,
    "titleAr": "من مهاراتك إلى حلول مفيدة وأثر واضح: حسّن سيرتك الذاتية",
    "titleEn": "Skills, useful solutions and impact: improve your CV",
    "summaryAr": "حوّل وصف مهاراتك إلى صورة مفهومة لما تستطيع بناءه أو تحسينه، ولماذا يهم المستخدم والبزنس. طبّق المراجعة وارفع CV محدّثًا هنا لفتح تحليلاتك.",
    "summaryEn": "Connect your skills to useful solutions and meaningful user and business outcomes. Apply the review and upload your revised CV here to unlock analytics.",
    "contentAr": "<h3>ليه ده مهم؟</h3><p>مسؤول تقني محتاج يفهم قدراتك وطريقة شغلك، وشخص من البزنس محتاج يفهم المشكلة اللي تقدر تحلها. السيرة القوية بتربط الاتنين من غير مبالغة أو مصطلحات للتزيين.</p><h3>١. مهاراتك: بتعرف تعمل إيه؟</h3><p>حدّد المهارات المرتبطة بتخصصك، وادعمها بمثال حقيقي من مشروع أو تدريب أو شغل. بدل قائمة أدوات طويلة، وضّح استخدمت المهارة إزاي وإيه قرارك أنت.</p><h3>٢. حلول مفيدة: المهارة دي بتخدم مين؟</h3><p>اربط المهارة بمشكلة وتجربة أو نظام فعلي: مثل واجهة تسهّل إتمام طلب، اختبار يمنع عطلًا، لوحة بيانات تساعد قرارًا، أو جزء من CRM أو ERP لو ده مناسب لشغلك. الأمثلة تتغير حسب التخصص؛ مش مطلوب تدّعي بناء نظام كامل.</p><h3>٣. الأثر على المستخدم والبزنس</h3><p>اشرح النتيجة: تقليل أخطاء أو وقت تنفيذ، تحسين تجربة أو أداء، دعم المبيعات، أو تسريع طرح منتج. استخدم أرقامًا عندك دليل عليها فقط؛ لو مفيش قياس، صف الأثر المتوقع بوضوح من غير تحويله لإنجاز متحقق.</p><p><strong>صيغة مفيدة:</strong> استخدمت [المهارة] في [حل أو مشروع] لمساعدة [مستخدم/فريق] على [نتيجة حقيقية أو هدف واضح].</p><h3>اعمل إيه دلوقتي؟</h3><ol><li>انسخ البرومبت؛ تخصصك ورابط بورتفوليوك متضافين من ملفك.</li><li>ابعت الـCV الحالي مع البرومبت لأداة الذكاء الاصطناعي اللي بتستخدمها، واسمح لها بمراجعة البورتفوليو أو شارك نصوصه لو الرابط مش متاح لها.</li><li>راجع الاقتراحات والنسخة المعدّلة بنفسك، وارفع الـCV الجديد من الزر هنا.</li><li>بعد حفظ النسخة الجديدة، الإرشاد هيكتمل تلقائيًا وتفتح تحليلات الأداء، وتبدأ فترة متابعة جديدة من غير تغيير الطلبات القديمة.</li></ol>",
    "contentEn": "<h3>Make your value understandable</h3><p>A technical reviewer needs evidence of your ability and decisions; a business reviewer needs to understand the problem you can help solve. Connect three layers without exaggeration.</p><ol><li><strong>Skills:</strong> relevant capabilities supported by a real project, training or work example.</li><li><strong>Useful solutions:</strong> explain who benefits and how. A workflow, interface, test plan, dashboard or part of a CRM/ERP may fit your specialization; do not claim ownership of a whole system you did not build.</li><li><strong>User and business impact:</strong> fewer errors, less time, better experience or performance, supported sales, or faster delivery. Use numbers only with evidence. Label unmeasured goals as goals.</li></ol><p>Use the prompt with your current CV and portfolio. Review the revision, upload a genuinely updated CV below. Completion is confirmed automatically after saving, unlocking analytics. Earlier applications remain linked to their original observation period.</p>",
    "promptTemplateAr": "أنت مراجع توظيف وسير ذاتية متخصص في {{specialization}}، وتقدر تشرح القيمة لشخص تقني ولشخص من البزنس.\nتخصصي: {{specialization}}\nرابط أعمالي (البورتفوليو): {{portfolioUrl}}\nاعتمد فقط على المعلومات والمرفقات التي أشاركها في هذه المحادثة، واطلب مني أي معلومات ناقصة.\nسأرفق الـCV الحالي بهذه الرسالة. لا تبدأ قبل قراءة المرفق؛ لو لم يصل اطلبه مني. راجع البورتفوليو إن استطعت فتحه، وإلا اطلب نصوص/صور المشاريع ولا تدّعي أنك قرأته.\nراجع السيرة والبورتفوليو معًا وفق: المهارات → حلول مفيدة للمستخدم → أثر على البزنس.\n1) قيّم كل جانب من 5 مع دليل من المواد المتاحة، وافصل بين نقص المعلومات وضعف الخبرة. وضّح أهم التعديلات وأسبابها بترتيب الأولوية.\n2) اختر أمثلة تناسب تخصصي، واشرح كيف تتحول مهاراتي إلى تجربة/خدمة/نظام مفيد؛ استخدم CRM أو ERP فقط إذا كانت خبرتي تدعم ذلك.\n3) أعد صياغة الملخص والخبرات والمشاريع لتربط قراراتي ومساهمتي بالمستخدم والنتيجة، بلغة يفهمها التقني والبزنس، مع تنسيق واضح ومتوافق مع ATS.\n4) لا تخترع أدوات أو خبرات أو أرقامًا أو أثرًا ماليًا. اسألني عما ينقصك قبل إضافة ادعاء، وميّز بين نتيجة متحققة وهدف متوقع.\n5) بعد إجاباتي، قدّم نسخة CV منقّحة كاملة جاهزة للمراجعة؛ إن كانت أداتك تدعم الملفات أرفق نسخة قابلة للتنزيل، وإلا قدّم النص المنسق. اختم بقائمة تحقق لمراجعة دقة المعلومات وتنسيق السيرة قبل اعتمادها والتقديم بها على الوظائف.",
    "promptTemplateEn": "Act as a hiring and CV reviewer for {{specialization}}. Explain value to both technical and business readers.\nMy specialization: {{specialization}}\nMy portfolio URL: {{portfolioUrl}}\nUse only the information and attachments I share in this conversation, and ask me for any missing information.\nI will attach my current CV. Ask for it if missing. Review the portfolio if accessible; otherwise request project text/screenshots and do not claim to have read it.\nAssess skills → useful user solutions → business impact. Score each layer out of 5 with evidence; distinguish missing information from lack of experience. Prioritize concrete corrections.\nUse examples appropriate to my specialization; mention CRM/ERP only where supported. Rewrite the summary, experience and projects to explain my contribution, decisions, users and outcomes clearly, with ATS-friendly structure. Never invent experience, tools, metrics or financial outcomes. Ask for missing evidence and distinguish achieved results from intended benefits.\nAfter my answers, provide a complete revised CV for review. Attach a downloadable file if your tool supports files, otherwise provide formatted text. End with a checklist to verify accuracy and formatting before using the revised CV for job applications."
  },
  {
    "code": "INSIGHT_W1_INTERVIEW_BASIC",
    "weekNumber": 1,
    "titleAr": "المقابلة والتكليف العملي: اشرح مهاراتك والحل وأثره",
    "titleEn": "Interviews and assignments: explain your skills, solution and impact",
    "summaryAr": "تدرّب على شرح قدراتك، مين المستفيد من شغلك، وليه نتيجته مهمة للبزنس. جهّز تقديمك وأمثلتك وخطة التكليف ورسائل التسليم حسب تخصصك.",
    "summaryEn": "Practice explaining your capabilities, who benefits and why the result matters. Prepare your introduction, examples, assignment plan and delivery messages for your specialization.",
    "contentAr": "<h3>خيط واحد للمقابلة والتكليف</h3><p>ما تكتفيش بذكر الأدوات. اشرح مهارتك، والحل اللي استخدمتها فيه، وإزاي ده خدم المستخدم أو الفريق والبزنس. استخدم أمثلة حقيقية من تخصصك؛ مش لازم المثال يكون مشروعًا ضخمًا أو إنجازًا ماليًا.</p><h3>في المقابلة</h3><ul><li>جهّز تقديمًا من 60–90 ثانية يربط تخصصك بمشكلة الوظيفة.</li><li>اختار مثالين: المشكلة، دورك وقرارك، الحل، النتيجة وما تعلمته. ميّز دورك عن دور الفريق.</li><li>تدرّب على نفس المثال بصيغتين: تفاصيل وقرارات لشخص تقني، وقيمة وحدود واضحة لشخص من البزنس.</li><li>اسأل عن المستخدمين ومعايير النجاح وأولويات الفريق. لو ما تعرفش إجابة، وضّح طريقة بحثك بدل اختراعها.</li></ul><h3>في التكليف العملي (Assignment)</h3><ul><li>افهم المطلوب ومعيار التقييم والوقت المتاح. اسأل عن أي غموض قبل التنفيذ.</li><li>قسّم المطلوب لنتيجة أساسية تعمل، ثم تحسينات لو الوقت يسمح. وضّح الافتراضات والحدود.</li><li>قدّم طريقة استخدام/تشغيل أو عرض مناسب لتخصصك، واختبارات أو تحققًا من الجودة، واشرح القرارات المهمة.</li><li>في رسالة التسليم: ما أنجزته، فائدته للمستخدم، صلته بهدف البزنس، طريقة مراجعته، وما يحتاج متابعة. لا تدّعِ اختبارًا أو نتيجة لم تتحقق.</li></ul><p>البرومبت التالي يحوّل سيرتك والبورتفوليو والوصف الوظيفي لتدريب تفاعلي. هذه الإرشادات تُستكمل بزر القراءة العادي؛ لا تحتاج رفع CV جديد.</p>",
    "contentEn": "<h3>One thread for interviews and assignments</h3><p>Explain your skill, the solution you used it in, and why it helped users or the business. Use real examples appropriate to your specialization.</p><h3>Interviews</h3><p>Prepare a 60–90 second introduction and two stories covering the problem, your contribution and decisions, the result and lessons. Practice a technical version and a business-friendly version. Ask about users, success criteria and priorities; acknowledge unknowns.</p><h3>Practical assignments</h3><p>Clarify the brief, evaluation criteria and available time. Prioritize a working core result; document assumptions, decisions, quality checks and limitations. Your delivery message should explain what works, who benefits, how to review it and what remains. Never claim unperformed tests or unsupported outcomes. Use the prompt for interactive practice. Normal reading confirmation completes this guide; no new CV upload is required.</p>",
    "promptTemplateAr": "أنت مدرب مقابلات ومقيّم تكليفات عملية لتخصص {{specialization}}.\nتخصصي من ملف نواة: {{specialization}}\nبورتفوليوي: {{portfolioUrl}}\nسأرفق سيرتي، ثم أرسل الوصف الوظيفي أو نص التكليف إن وُجد. اطلب المواد الناقصة. لا تدّعي قراءة رابط لا تستطيع فتحه.\nدرّبني على توصيل 3 جوانب: قدراتي ومهاراتي → الحل المفيد للمستخدم → أثره على البزنس، بأمثلة من تخصصي وخبرتي الحقيقية فقط.\nابدأ بسؤال واحد لتفهم الوظيفة، ثم:\n1) ساعدني أصيغ تقديمًا مدته 60–90 ثانية، ومثالين واقعيين يوضحان دوري وقراراتي والنتائج والحدود.\n2) اعمل مقابلة تجريبية بسؤال واحد في كل مرة، تشمل التقني والسلوكي والبزنس. بعد إجابتي قيّم الوضوح والدليل وفهم المستخدم والأثر، ثم اقترح تحسينًا واطلب مني المحاولة مجددًا.\n3) أعطني تكليفًا تدريبيًا مناسبًا لمستواي وتخصصي، مع وقت مقترح ومعايير تقييم واضحة. ساعدني أفهم المطلوب وأسأل عن الغموض وأخطط للتنفيذ والتحقق من الجودة.\n4) راجع الحل الذي أقدمه دون اختراع تجربة أو قياس، ودرّبني على شرحه لشخص تقني ولشخص من البزنس.\n5) جهّز معي رسائل قصيرة لتوضيح متطلبات التكليف، وتأكيد موعد التسليم، وتسليم النتيجة بروابطها وطريقة مراجعتها وحدودها. لا تقدّم التدريب كحل مكتمل لتقييم توظيف فعلي يطلب عملًا مستقلًا مني.",
    "promptTemplateEn": "Act as an interview coach and practical-assignment reviewer for {{specialization}}.\nMy profile specialization: {{specialization}}\nMy portfolio: {{portfolioUrl}}\nI will attach my CV and share the job description or assignment brief. Ask for missing material. Do not claim to have read inaccessible links.\nTrain me to connect capabilities → a useful user solution → business impact, using my real experience and appropriate examples.\nAsk one context question first. Then help prepare a 60–90 second introduction and two evidence-backed stories; run a mock interview one question at a time, assessing clarity, evidence, user understanding and impact after each answer.\nSet a practice assignment suitable for my role and level with time guidance and evaluation criteria. Help clarify requirements, plan, verify quality and explain decisions to technical and business reviewers. Review my work without inventing tests or results.\nPractice concise clarification, scheduling and delivery messages covering links, review instructions, value and limitations. Distinguish coaching from completing an actual hiring assessment that requires my independent work."
  },
  {
    code: 'INSIGHT_W1_TAILORED_CV',
    weekNumber: 1,
    titleAr:
      'استراتيجية الطلبات الخاصة (Tailored Applications) وتخصيص السيرة الذاتية',
    titleEn: 'Tailored Applications Strategy & Precision CV Customization',
    summaryAr:
      'كيف تحول معدل التحويل من التقديم العام إلى التقديم المخصص عبر مواءمة أول 3 نقاط في سيرتك الذاتية مع متطلبات كل فرصة.',
    summaryEn:
      'How to boost your conversion rate by aligning the top third of your CV with specific job descriptions.',
    promptTemplateAr: `أريد التقديم بطلب مخصص (Tailored Application) على هذه الوظيفة:
الوصف الوظيفي:
[الصق الوصف الوظيفي هنا]

سيرتي الذاتية الحالية:
[الصق سيرتك الذاتية هنا]

المطلوب:
1. استخراج أهم 5 متطلبات أساسية في الإعلان غير بارزة بوضوح في سيرتي الحالية.
2. تعديل الملخص المهني وأول 4 نقاط في الخبرات لتعكس مصطلحات الإعلان بدقة وبدون مبالغة.
3. كتابة رسالة تغطية قصيرة (Short Pitch) من 4 جمل لإرسالها مع الطلب.`,
    promptTemplateEn: `I am submitting a Tailored Application for this role:
Job Description:
[Paste Job Description]

My Current CV:
[Paste CV]

Please:
1. Identify the top 5 core requirements in the JD that are underrepresented in my CV.
2. Tailor my summary and top 4 experience bullets to mirror the JD's exact terminology authentically.
3. Write a concise 4-sentence pitch note to attach with my application.`,
  },
  {
    code: 'INSIGHT_W2_CUSTOM_PREP',
    weekNumber: 2,
    titleAr: 'التجهيز المخصص للشركات المستهدفة وتحليل نقاط الألم',
    titleEn: 'Custom Company Research & Pain-Point Analysis',
    summaryAr:
      'منهجية البحث السريع عن الشركة وفهم المنتج والتحديات التقنية قبل إرسال الطلبات الخاصة لرفع نسبة الردود.',
    summaryEn:
      'Rapid company research methodology to understand product challenges before sending tailored applications.',
    promptTemplateAr: `أستهدف التقديم على شركة [اسم الشركة] في مجال [مجال الشركة] لوظيفة [المسمى الوظيفي].
الوصف الوظيفي:
[الصق الوصف الوظيفي]

المطلوب:
1. تحليل التحديات المتوقعة التي جعلت الشركة تفتح هذه الوظيفة الآن.
2. كيف أقدم نفسي كـ "حل مباشر" لهذه التحديات في سيرتي الذاتية ورسالة التقديم؟`,
    promptTemplateEn: `I am targeting [Company Name] in the [Industry] sector for the [Job Title] position.
Job Description:
[Paste Job Description]

Please:
1. Analyze the likely team pain points that triggered this job opening.
2. Show me how to position my experience as a direct solution in my application.`,
  },
  {
    code: 'INSIGHT_W2_CONTENT_BUILDING',
    weekNumber: 2,
    titleAr: 'دليل صناعة المحتوى المهني على LinkedIn لجذب مسؤولي التوظيف',
    titleEn: 'LinkedIn Professional Content Playbook for Inbound Opportunities',
    summaryAr:
      'معادلة كتابة المنشورات التقنية والمهنية في الأسبوع الثالث لتحويل حسابك على LinkedIn إلى مغناطيس للفرص.',
    summaryEn:
      'The formula for writing high-signal technical and career posts in Week 3 to attract recruiters.',
    promptTemplateAr: `أريد كتابة منشور مهني على LinkedIn ضمن خطة الأسبوع الثالث.
الموضوع أو الدرس التقني الذي تعلمته هذا الأسبوع:
[اكتب الفكرة أو المشروع أو التحدي التقني هنا]

المطلوب:
1. كتابة منشور احترافي يبدأ بـ Hook قوي في أول سطرين.
2. تقسيم المحتوى إلى نقاط واضحة تقدم قيمة عملية للقارئ.
3. ختم المنشور بسؤال تفاعلي و 4 وسوم (Hashtags) مناسبة لمجال [المسمى الوظيفي].`,
    promptTemplateEn: `I want to write a high-signal LinkedIn post for Week 3 of my career sprint.
Topic or technical lesson I worked on this week:
[Insert topic, project, or challenge]

Please:
1. Write a professional post starting with a compelling 2-line hook.
2. Structure the body into clear, actionable takeaways.
3. End with an engaging question and 4 relevant hashtags for [Target Role].`,
  },
  {
    code: 'INSIGHT_W3_TIME_MGMT',
    weekNumber: 3,
    titleAr: 'إدارة الوقت والزخم بين التقديم وصناعة المحتوى والتحضير',
    titleEn: 'Time & Energy Management Across Applications, Content & Prep',
    summaryAr:
      'نظام تقسيم اليوم (Time-Blocking) لإنجاز الطلبات اليومية المخصصة مع صناعة المحتوى دون إرهاق ذهني.',
    summaryEn:
      'A time-blocking system to complete daily tailored applications and LinkedIn content without burnout.',
    promptTemplateAr: `ساعدني في تصميم جدول يومي عملي (Time-Blocked Schedule) لمدة [عدد الساعات المتاحة يومياً] ساعات يومياً لتحقيق:
- إرسال [عدد الطلبات] طلب تقديم (منها طلبات مخصصة).
- كتابة منشور مهني على LinkedIn.
- تخصيص وقت للمراجعة والتحضير للمقابلات.`,
    promptTemplateEn: `Help me design a realistic daily time-blocked schedule for [Available Hours] hours/day to achieve:
- Submitting [Number] job applications (including tailored ones).
- Writing a LinkedIn post.
- Dedicated interview preparation without burnout.`,
  },
  {
    code: 'INSIGHT_W3_NETWORKING',
    weekNumber: 3,
    titleAr:
      'استراتيجية التواصل المباشر (Outreach) وبناء الإحالات في الأسبوع الرابع',
    titleEn: 'Direct Outreach & Referral Building Strategy for Week 4',
    summaryAr:
      'قوالب عملية للتواصل مع مسؤولي التوظيف وقادة الفرق التقنية بعد التقديم لرفع فرص المقابلة بـ 3 أضعاف.',
    summaryEn:
      'Proven outreach templates for contacting recruiters and hiring managers to triple your interview rate.',
    promptTemplateAr: `لقد قدمت على وظيفة [المسمى الوظيفي] في شركة [اسم الشركة]، وأريد إرسال رسالة تواصل مباشر (Outreach) على LinkedIn إلى [اسم الشخص / مسماه الوظيفي: Recruiter أو Engineering Manager].
أبرز نقاط قوتي المرتبطة بالوظيفة:
[اذكر نقطتين باختصار]

المطلوب:
1. كتابة رسالة قصيرة لطلب الاتصال (Connection Note - أقل من 280 حرفاً).
2. كتابة رسالة متابعة احترافية بعد قبول الإضافة توضح قيمتي المضافة وتطلب نصيحة سريعة أو توجيه طلبي.`,
    promptTemplateEn: `I just applied for [Job Title] at [Company Name] and want to send a LinkedIn outreach message to [Contact Role: Recruiter / Hiring Manager].
My top 2 relevant strengths:
[Insert 2 key strengths]

Please:
1. Write a concise LinkedIn Connection Note (under 280 characters).
2. Write a value-driven follow-up message after they accept, highlighting my fit without sounding generic.`,
  },
  {
    code: 'INSIGHT_W4_SELF_CAREER_PLAN',
    weekNumber: 4,
    titleAr: 'خطة الاستمرارية المهنية الذاتية ونظام التفاوض والإغلاق',
    titleEn: 'Self-Directed Career Momentum & Offer Negotiation Playbook',
    summaryAr:
      'كيف تقود رحلتك المهنية باستقلالية عالية وتتعامل مع مراحل القرار النهائي والتفاوض على العروض الوظيفية.',
    summaryEn:
      'How to sustain autonomous career momentum and navigate final-stage decisions and offer negotiations.',
    promptTemplateAr: `وصلت إلى المراحل المتقدمة في عملية التوظيف لوظيفة [المسمى الوظيفي].
أريد التحضير لمقابلة المرحلة النهائية ومناقشة العرض الوظيفي:
1. ما هي أهم الأسئلة الاستراتيجية التي يجب أن أكون مستعداً لها في المقابلة النهائية؟
2. صياغة نص احترافي للتفاوض على العرض الوظيفي بأسلوب تعاوني يحفظ العلاقة الإيجابية مع الشركة.`,
    promptTemplateEn: `I am reaching final-stage interviews for [Job Title].
Please help me prepare:
1. What strategic questions should I expect in a final executive/culture-fit round?
2. Draft a collaborative, professional script for negotiating compensation once an offer is extended.`,
  },
  {
    code: 'INSIGHT_INTERVIEW_ADVANCED',
    weekNumber: 2,
    isAdvanced: true,
    titleAr:
      'الدليل المتقدم لاجتياز المقابلات التقنية والتاسكات العملية (STAR + System Design)',
    titleEn:
      'Advanced Playbook: Mastering Technical Assignments & Deep-Dive Interviews',
    summaryAr:
      'تكتيكات متقدمة لتحويل التاسكات العملية (Take-Home Assignments) والمقابلات السلوكية والعميقة إلى عروض عمل.',
    summaryEn:
      'Advanced tactics to turn take-home assignments and deep-dive technical interviews into job offers.',
    promptTemplateAr: `لدي مقابلة متقدمة / تاسك عملي (Assignment) لوظيفة [المسمى الوظيفي] في شركة [اسم الشركة].
تفاصيل التاسك أو المقابلة:
[الصق تفاصيل التاسك أو محاور المقابلة هنا]

المطلوب:
1. خطة تنفيذ هندسية لتسليم التاسك بجودة Production-Ready مع ملف README احترافي يبهر المقيّمين.
2. صياغة 3 قصص نجاح من خبرتي بطريقة STAR (Situation, Task, Action, Result) للمقابلة المتقدمة.
3. قائمة فحص (Checklist) بأهم النقاط الهندسية التي يبحث عنها الكبار (Senior Reviewers) عند مناقشة الكود.`,
    promptTemplateEn: `I have an advanced interview / take-home assignment for [Job Title] at [Company Name].
Assignment or interview details:
[Paste details here]

Please provide:
1. An engineering execution plan to deliver a production-ready submission with an impressive README.
2. 3 STAR-method stories tailored for senior behavioral & architectural trade-off questions.
3. A review checklist of what senior engineers look for when discussing my solution.`,
  },
];
