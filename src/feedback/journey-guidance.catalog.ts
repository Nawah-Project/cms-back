export interface JourneyGuidanceSeedItem {
  code: string;
  weekNumber: number;
  isAdvanced?: boolean;
  titleAr: string;
  titleEn: string;
  summaryAr: string;
  summaryEn: string;
  promptTemplateAr: string;
  promptTemplateEn: string;
}

export const JOURNEY_GUIDANCE_CATALOG: JourneyGuidanceSeedItem[] = [
  {
    code: 'INSIGHT_TASK_0_CV_BASE',
    weekNumber: 0,
    titleAr: 'ملاحظة 0: تأسيس السيرة الذاتية الأساسية المتوافقة مع ATS',
    titleEn: 'Insight 0: Building Your ATS-Ready Base CV',
    summaryAr:
      'كيف تهيكل سيرتك الذاتية الأساسية بلغة الإنجازات القابلة للقياس وتضمن اجتياز أنظمة الفرز الآلي (ATS) قبل الانطلاق في الأسبوع الأول.',
    summaryEn:
      'How to structure your core CV around measurable impact and pass ATS filters before starting Week 1.',
    promptTemplateAr: `أنت خبير توظيف تقني ومراجع سير ذاتية (ATS Specialist).
المسمى الوظيفي المستهدف: [اكتب المسمى الوظيفي هنا]
هذه نبذة عن خبراتي ومشاريعي الحالية:
[الصق خبراتك ومشاريعك هنا]

المطلوب:
1. إعادة صياغة النقاط بنظام (Action Verb + Task + Measurable Impact).
2. اقتراح أهم 12 كلمة مفتاحية تقنية يجب تضمينها لهذا المسمى الوظيفي.
3. كتابة ملخص مهني (Professional Summary) من 3 أسطر يجذب مسؤول التوظيف خلال 6 ثوانٍ.`,
    promptTemplateEn: `Act as a Senior Technical Recruiter and ATS Specialist.
Target Role: [Insert Target Job Title]
Here are my current experiences and projects:
[Paste your current CV bullet points / projects]

Please:
1. Rewrite my bullet points using the Action Verb + Task + Measurable Impact formula.
2. Suggest the top 12 ATS keywords for this target role.
3. Write a 3-line high-impact Professional Summary tailored for a 6-second recruiter scan.`,
  },
  {
    code: 'INSIGHT_W1_INTERVIEW_BASIC',
    weekNumber: 1,
    titleAr: 'الدليل الأساسي للتحضير السريع للمقابلات الأولى',
    titleEn: 'Core Guide: Rapid Preparation for First-Round Interviews',
    summaryAr:
      'إطار عمل عملي من 4 خطوات للتحضير لأي مقابلة تعارف أو فحص هاتفي (Screening Call) خلال 30 دقيقة بثقة عالية.',
    summaryEn:
      'A practical 4-step framework to prepare for any HR screening or first-round interview in 30 minutes.',
    promptTemplateAr: `أنت مدير توظيف في شركة تقنية. لدي مقابلة أولى على وظيفة [المسمى الوظيفي] في شركة [اسم الشركة].
هذا هو الوصف الوظيفي:
[الصق الوصف الوظيفي هنا]

المطلوب:
1. صياغة إجابة مثالية لسؤال "حدثني عن نفسك" في 90 ثانية تربط خبرتي بالوظيفة.
2. توقع أهم 5 أسئلة فنية وسلوكية قد تُطرح في المكالمة الأولى مع نقاط الإجابة النموذجية.
3. اقتراح 3 أسئلة ذكية أطرحها في نهاية المقابلة لإظهار اهتمامي الحقيقي.`,
    promptTemplateEn: `Act as a Hiring Manager. I have a first-round interview for [Job Title] at [Company Name].
Job Description:
[Paste Job Description]

Please:
1. Craft a 90-second "Tell me about yourself" pitch connecting my background to this role.
2. Predict the top 5 screening questions (technical & behavioral) with key talking points.
3. Give me 3 insightful questions to ask the interviewer at the end.`,
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
