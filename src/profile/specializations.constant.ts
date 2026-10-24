export interface SpecializationOption {
  value: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
}

export const STANDARDIZED_SPECIALIZATIONS: SpecializationOption[] = [
  {
    value: 'UI/UX Designer',
    titleAr: 'مصمم تجربة وواجهة المستخدم',
    titleEn: 'UI/UX Designer',
    descriptionAr:
      'تصميم واجهات وتجربة الاستخدام وبناء النماذج التفاعلية واختبار سهولة الاستخدام',
  },
  {
    value: 'Frontend Developer',
    titleAr: 'مطور واجهات أمامية',
    titleEn: 'Frontend Developer',
    descriptionAr:
      'تطوير تطبيقات الويب التفاعلية الحديثة والربط السلس مع الواجهات البرمجية',
  },
  {
    value: 'Backend Developer',
    titleAr: 'مطور واجهات خلفية',
    titleEn: 'Backend Developer',
    descriptionAr:
      'بناء الأنظمة الخلفية وقواعد البيانات والخدمات السحابية والواجهات البرمجية',
  },
  {
    value: 'Full Stack Developer',
    titleAr: 'مطور ويب متكامل',
    titleEn: 'Full Stack Developer',
    descriptionAr:
      'تطوير شامل للواجهات الأمامية والخلفية وهندسة التطبيقات السحابية المتكاملة',
  },
  {
    value: 'AI Engineer',
    titleAr: 'مهندس ذكاء اصطناعي',
    titleEn: 'AI Engineer',
    descriptionAr:
      'هندسة النماذج الذكية والتعلم الآلي وتكامل أدوات وتطبيقات الذكاء التوليدي',
  },
  {
    value: 'Mobile Developer',
    titleAr: 'مطور تطبيقات موبايل',
    titleEn: 'Mobile Developer',
    descriptionAr:
      'تطوير تطبيقات الهواتف الذكية لأنظمة iOS و Android وتجارب المستخدم عبر الأجهزة',
  },
  {
    value: 'Data Analyst',
    titleAr: 'محلل بيانات',
    titleEn: 'Data Analyst',
    descriptionAr:
      'تحليل البيانات واستخراج الرؤى وبناء لوحات التحكم التفاعلية للقرارات الإستراتيجية',
  },
  {
    value: 'Data Scientist',
    titleAr: 'عالم بيانات',
    titleEn: 'Data Scientist',
    descriptionAr:
      'بناء النماذج التنبؤية والخوارزميات الإحصائية واستخراج الأنماط من البيانات الضخمة',
  },
  {
    value: 'DevOps Engineer',
    titleAr: 'مهندس ديف أوبس',
    titleEn: 'DevOps Engineer',
    descriptionAr:
      'إدارة البنية التحتية السحابية وأتمتة خطوط النشر والتشغيل والمراقبة المستمرة',
  },
  {
    value: 'Software QA Engineer',
    titleAr: 'مهندس ضمان جودة البرمجيات',
    titleEn: 'Software QA Engineer',
    descriptionAr:
      'ضمان جودة النظم وكتابة الاختبارات المؤتمتة واختبارات الأداء والأمان',
  },
  {
    value: 'Product Manager',
    titleAr: 'مدير منتج رقمي',
    titleEn: 'Product Manager',
    descriptionAr:
      'قيادة إستراتيجية المنتجات الرقمية وإدارة دورة حياة المنتج وتحقيق التوافق مع السوق',
  },
  {
    value: 'Cybersecurity Specialist',
    titleAr: 'أخصائي أمن سيبراني',
    titleEn: 'Cybersecurity Specialist',
    descriptionAr:
      'حماية الأنظمة والشبكات والبيانات وتحليل الثغرات والاستجابة للحوادث السيبرانية',
  },
];

export const VALID_SPECIALIZATION_VALUES = STANDARDIZED_SPECIALIZATIONS.map(
  (s) => s.value,
);
