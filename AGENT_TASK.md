# AGENT_TASK.md — خطة تحديث الباك إند ودعم تجربة المستخدم (Nawah Backend)

## 0. قواعد صارمة للإيجنت (يجب الالتزام بها)
1. **عدم كسر العقود البرمجية الحالية (API Contracts)**: جميع المسارات الحالية وحقول الاستجابة ونظام المصادقة (`JwtAuthGuard`, `AdminGuard`, والكوكيز المحمية `HttpOnly`) يجب أن تظل متوافقة مع الكود الحالي.
2. **التعديلات على الاستجابات تكون بالإضافة فقط (Additive Only)**: عند تحديث أي Endpoint (مثل `/applications` أو `/applications/dashboard` أو `/admin/monitoring/users`)، أضف الحقول الجديدة دون حذف أو تغيير أسماء الحقول القديمة.
3. **عدم تثبيت مكتبات خارجية جديدة**: استخدم الحزم الموجودة بالفعل في المشروع (`@nestjs/common`, `@prisma/client`, `class-validator`, `class-transformer`).
4. **تحديث اختبارات الوحدات (Unit Tests)**: بعد كل تعديل، تأكد من تحديث ملفات `.spec.ts` المرتبطة ونجاح أمر `npm test` و `npm run build`.

---

## المرحلة 1: تحسينات قسم طلبات التوظيف (`ApplicationsModule`) ودعم التنبيهات

### 1.1 دعم فلتر `ACTIVE` وإرجاع العدد الكلي غير المفلتر (`unfilteredTotal`) في `GET /applications`
- **الملف**: `src/applications/dto/application-query.dto.ts`
  - عدّل حقل `stage` ليقبل القيمة `'ACTIVE'` بالإضافة إلى قيم `ApplicationStage` الأربع باستخدام `@IsIn([...Object.values(ApplicationStage), 'ACTIVE'])` وتحديث النوع إلى `ApplicationStage | 'ACTIVE'`.
- **الملف**: `src/applications/applications.service.ts`
  - في الواجهة `PaginatedApplications`: أضف الحقل `unfilteredTotal: number;`.
  - في دالة `findAll(userId, query)`:
    - إذا كانت `query.stage === 'ACTIVE'`، اجعل شرط الفلترة في Prisma هو `stage: { not: ApplicationStage.CLOSED }`.
    - داخل `$transaction`، نفّذ استعلاماً ثالثاً `this.prisma.application.count({ where: { userId } })` لحساب إجمالي طلبات المستخدم بدون أي فلاتر، وأرجعه في الحقل `unfilteredTotal` مع `{ data, total, unfilteredTotal, page, limit, totalPages }`. (هذا يلغي حاجة الفرونت إند لإرسال طلبين متتاليين في كل مرة).

### 1.2 إصلاح خطأ تعديل الوظائف المغلقة مسبقاً بـ `NO_RESPONSE`
- **الملف**: `src/applications/applications.service.ts`
  - في دالة `update(userId, id, updateDto)`:
    - احذف الشرط الموجود في أول سطر من الدالة والذي يرمي خطأ `BadRequestException` بمجرد وجود `updateDto.outcome === ApplicationOutcome.NO_RESPONSE`.
    - انقل هذا التحقق إلى داخل الـ `$transaction` بعد جلب السجل `application` من قاعدة البيانات، بحيث يرمي الخطأ **فقط** إذا كان المستخدم يحاول تعيين `NO_RESPONSE` لوظيفة لم تكن `NO_RESPONSE` من الأساس:
      ```ts
      if (
        updateDto.outcome === ApplicationOutcome.NO_RESPONSE &&
        application.outcome !== ApplicationOutcome.NO_RESPONSE
      ) {
        throw new BadRequestException(
          'NO_RESPONSE is assigned automatically after seven days without a response',
        );
      }
      ```

### 1.3 إضافة عدادات التذكير والإغلاق التلقائي في `GET /applications/dashboard`
- **الملف**: `src/applications/applications.service.ts`
  - في الواجهة `DashboardStats`: أضف الحقلين الاختياريين/الجديدين:
    - `expiringSoonCount: number;`
    - `recentNoResponseCount: number;`
  - في دالة `getDashboard(userId)`:
    - بما أن `NoResponseProcessor` يغلق الوظائف تلقائياً بعد 7 أيام من عدم التحديث، احسب بالتوازي داخل `Promise.all`:
      1. `expiringSoonCount`: عدد الطلبات النشطة (`userId`, `stage: { not: 'CLOSED' }`) التي مر على تاريخ آخر تحديث لها (`updatedAt`) ما بين **4 إلى 7 أيام** (أي تقترب من الإغلاق التلقائي وتحتاج تذكيراً للعضو).
      2. `recentNoResponseCount`: عدد الطلبات المغلقة بنتيجة `NO_RESPONSE` (`userId`, `stage: 'CLOSED'`, `outcome: 'NO_RESPONSE'`) والتي تم إغلاقها خلال آخر **7 أيام** (`closedAt: { gte: sevenDaysAgo }`).
    - أرجع `expiringSoonCount` و `recentNoResponseCount` ضمن الكائن المرجع من `getDashboard`.

---

## المرحلة 2: إصلاح لوحة تحكم الأدمن (`AdminModule`) وحساب النشاط ومشكلة الـ N+1

### 2.1 إصلاح حساب نشاط العضو واستبعاد حسابات الـ `ADMIN` من إحصائيات الأعضاء
- **الملف**: `src/admin/admin.service.ts`
  - في دالة `userActivityCte()`:
    - أضف CTE جديداً لحساب نشاط المهام حتى لا يظهر العضو النشط في المهام على أنه خامل (`NEVER_ACTIVE` أو `CRITICAL`):
      ```sql
      task_activity AS (
        SELECT "userId", MAX("updatedAt") AS last_at
        FROM tasks GROUP BY "userId"
      )
      ```
    - في `latest_activity`: ادمج `task_activity` في حساب `last_at` عبر `GREATEST(a.last_at, t.last_at, tk.last_at)` مع `LEFT JOIN task_activity tk ON tk."userId" = u.id`.
    - أضف شرط `WHERE u.role = 'USER'::"UserRole"` في `latest_activity` لاستبعاد حسابات المشرفين (`ADMIN`) من إحصائيات الأعضاء الخاملين وغير المعينين في المجموعات.
  - في دالة `getUserDetail(userId)`:
    - أضف أحدث تاريخ تحديث في مهام العضو (`this.prisma.task.aggregate({ where: { userId }, _max: { updatedAt: true } })`) إلى مصفوفة `dates` التي تحسب `lastActivityAt`.

### 2.2 القضاء على مشكلة الـ 40 طلباً (N+1 Requests) في `AdminService.getUsers()`
- **الملف**: `src/admin/admin.service.ts`
  - في دالة `getUsers(query)`:
    - أضف CTE فرعياً باسم `development_counts` داخل استعلام الـ SQL:
      ```sql
      development_counts AS (
        SELECT "userId",
          COUNT(*) FILTER (WHERE status <> 'DONE'::"TaskStatus")::int AS "activeTasks",
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'::"TaskStatus")::int AS "inProgressTasks",
          COUNT(*) FILTER (WHERE status <> 'DONE'::"TaskStatus" AND "dueDate" < CURRENT_TIMESTAMP)::int AS "overdueTasks",
          MAX("updatedAt") AS "lastTaskAt"
        FROM tasks GROUP BY "userId"
      )
      ```
    - اعمل `LEFT JOIN development_counts d ON d."userId" = c.id` وأرجع مع كل عضو في `items` الكائن التالي:
      ```ts
      development: {
        active: row.activeTasks ?? 0,
        inProgress: row.inProgressTasks ?? 0,
        overdue: row.overdueTasks ?? 0,
        lastTaskAt: row.lastTaskAt?.toISOString() ?? null,
      }
      ```

---

## المرحلة 3: تحسين مطابقة الشركات المشتركة بين أعضاء المجموعة (`MembersModule`)

### 3.1 جعل مقارنة اسم الشركة غير حساسة لحالة الأحرف (`sharedCompany`)
- **الملف**: `src/members/members.service.ts`
  - في دالة `getMemberDetail(currentUserId, targetMemberId)`:
    - عند البحث عن الشركات المشتركة بين أعضاء المجموعة، طبّع أسماء الشركات باستخدام `.trim().toLowerCase()`.
    - استخدم شرط `OR: companies.map((name) => ({ companyName: { equals: name.trim(), mode: 'insensitive' } }))` في استعلام Prisma، واحفظ المفاتيح في `sharedCompanyByName` بالحروف الصغيرة حتى تتطابق `"Vodafone"` مع `"vodafone"` بشكل سليم.

---

## المرحلة 4: إضافة مسارات قياس تجربة المستخدم واختبارات A/B (`UX Analytics & A/B Testing`)

### 4.1 إنشاء مسارات تسجيل وعرض بيانات الـ UX في `AdminModule`
- **الملف**: `src/admin/admin.service.ts` و `src/admin/admin.controller.ts`
  - أنشئ خدمة تخزين خفيفة وآمنة في الذاكرة (أو جدول/ملف JSON محلي لا يتطلب تغيير مخطط Prisma الأساسي) لتسجيل أحداث تجربة المستخدم (بحد أقصى آخر 2000 حدث مع عدادات تراكمية):
    - الأحداث المدعومة: `onboarding_started`, `onboarding_video_watched`, `onboarding_completed`, `application_created`, `application_stage_updated`, `task_status_changed`, `feedback_read`.
    - النسخ الاختبارية المدعومة: `variant?: 'A' | 'B'`.
  - أضف في `AdminController` (أو Controller مخصص مسجل في `AdminModule`):
    1. مسار للأعضاء `POST /ux-analytics/events` (محمي بـ `@UseGuards(JwtAuthGuard)` فقط بدون `AdminGuard`) يستقبل `{ name: string; variant?: 'A' | 'B'; metadata?: Record<string, any> }` ويسجل الحدث مع `userId`.
    2. مسار للمشرفين `GET /admin/monitoring/ux-analytics` (محمي بـ `@UseGuards(JwtAuthGuard, AdminGuard)`) يُرجع:
       - `totalsByEvent`: إجمالي كل حدث.
       - `uniqueUsersByEvent`: عدد المستخدمين الفريدين لكل حدث (لحساب معدل إكمال الـ Onboarding والوصول لهدف 50 عضواً).
       - `abTestSummary`: مقارنة بين النسخة `A` والنسخة `B` من حيث عدد المستخدمين وإجمالي التفاعلات (`application_created + task_status_changed + feedback_read`).

---

## المرحلة 5: التحقق النهائي
1. حدّث ملفات الاختبار (`src/applications/applications.service.spec.ts` و `src/members/members.service.spec.ts`) لتتوافق مع الحقول المضافة.
2. شغّل `npm test` وتأكد من نجاح جميع الاختبارات.
3. شغّل `npm run build` وتأكد من عدم وجود أي أخطاء TypeScript.
