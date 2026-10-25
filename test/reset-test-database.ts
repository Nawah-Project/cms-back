import { PrismaService } from '../src/prisma/prisma.service';

export async function resetTestDatabase(prisma: PrismaService): Promise<void> {
  if (
    process.env.NODE_ENV !== 'test' ||
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    new URL(process.env.TEST_DATABASE_URL).pathname !== '/cms_test'
  )
    throw new Error('Refusing reset outside disposable cms_test');
  const [database] = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (database?.name !== 'cms_test') throw new Error('Unexpected database');
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "task_notes", "task_checklist_items", "professional_tasks", "application_stage_transitions", "applications", "auth_identities", "memberships", "member_groups", "users" CASCADE',
  );
}
