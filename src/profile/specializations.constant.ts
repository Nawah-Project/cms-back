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
];

export const VALID_SPECIALIZATION_VALUES = STANDARDIZED_SPECIALIZATIONS.map(
  (s) => s.value,
);
