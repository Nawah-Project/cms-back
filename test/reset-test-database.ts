import { PrismaService } from '../src/prisma/prisma.service';

export async function resetTestDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "task_notes", "task_checklist_items", "professional_tasks", "application_stage_transitions", "applications", "auth_identities", "memberships", "member_groups", "users" CASCADE',
  );
}
