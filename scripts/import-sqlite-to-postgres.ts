import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

type Row = Record<string, unknown>;
const sourcePath = resolve(
  process.argv.slice(2).find((argument) => !argument.startsWith('--')) ||
    'applications.sqlite',
);
const apply = process.argv.includes('--apply');
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stages = new Set(['APPLIED', 'INTERVIEW', 'DECISION', 'CLOSED']);
const outcomes = new Set(['NONE', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']);
const methods = new Set([
  'COMPANY_WEBSITE',
  'LINKEDIN',
  'REFERRAL',
  'EMAIL',
  'RECRUITMENT_PLATFORM',
  'DIRECT_CONTACT',
  'OTHER',
]);
const prisma = new PrismaClient();

function text(row: Row, key: string, fallback = ''): string {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new Error(`Unsupported value in ${key}; import aborted.`);
}

function date(row: Row, key: string, fallback = new Date()): Date {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'bigint'
  ) {
    throw new Error(`Invalid date in ${key}; import aborted.`);
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid date in ${key}; import aborted.`);
  return parsed;
}

function safeId(value: string, idMap: Map<string, string>): string {
  let id = idMap.get(value);
  if (!id) {
    id = uuidPattern.test(value) ? value : randomUUID();
    idMap.set(value, id);
  }
  return id;
}

function readTable(db: DatabaseSync, tableName: string): Row[] {
  const found = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return found ? db.prepare(`SELECT * FROM "${tableName}"`).all() : [];
}

async function main(): Promise<void> {
  if (!existsSync(sourcePath))
    throw new Error(`SQLite source database not found: ${sourcePath}`);
  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  let invalid = 0;
  let skipped = 0;
  let orphanApplications = 0;
  let mismatchedTransitions = 0;
  const userIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  const applicationIds = new Map<string, string>();
  const membershipIds = new Map<string, string>();
  const transitionIds = new Map<string, string>();
  try {
    const rawUsers = readTable(sqlite, 'users');
    const rawGroups = readTable(sqlite, 'member_groups');
    const rawMemberships = readTable(sqlite, 'memberships');
    const rawApplications = readTable(sqlite, 'applications');
    const rawTransitions = readTable(sqlite, 'application_stage_transitions');
    const users = rawUsers.filter((row) => {
      const email = text(row, 'email').trim().toLowerCase();
      const valid =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        text(row, 'passwordHash').length > 0 &&
        text(row, 'name').trim().length > 0;
      if (!valid) {
        invalid += 1;
        return false;
      }
      userIds.set(text(row, 'id'), safeId(text(row, 'id'), userIds));
      return true;
    });
    const validEmails = new Set<string>();
    for (const user of users) {
      const email = text(user, 'email').trim().toLowerCase();
      if (validEmails.has(email))
        throw new Error(
          'Duplicate SQLite email values found; resolve them before import.',
        );
      validEmails.add(email);
    }
    const groups = rawGroups
      .sort(
        (a, b) =>
          date(a, 'createdAt').getTime() - date(b, 'createdAt').getTime() ||
          text(a, 'id').localeCompare(text(b, 'id')),
      )
      .map((row) => {
        groupIds.set(text(row, 'id'), safeId(text(row, 'id'), groupIds));
        return row;
      });
    const applications = rawApplications.filter((row) => {
      if (!userIds.has(text(row, 'userId'))) {
        invalid += 1;
        orphanApplications += 1;
        return false;
      }
      const valid =
        userIds.has(text(row, 'userId')) &&
        stages.has(text(row, 'stage')) &&
        outcomes.has(text(row, 'outcome')) &&
        (row.applicationMethod == null ||
          methods.has(text(row, 'applicationMethod')));
      if (!valid) {
        invalid += 1;
        return false;
      }
      applicationIds.set(
        text(row, 'id'),
        safeId(text(row, 'id'), applicationIds),
      );
      return true;
    });
    const transitions = rawTransitions.filter((row) => {
      const valid =
        applicationIds.has(text(row, 'applicationId')) &&
        userIds.has(text(row, 'userId')) &&
        stages.has(text(row, 'fromStage')) &&
        stages.has(text(row, 'toStage')) &&
        (row.outcome == null || outcomes.has(text(row, 'outcome'))) &&
        applications.find(
          (application) =>
            text(application, 'id') === text(row, 'applicationId'),
        )?.userId === row.userId;
      if (
        !valid &&
        applicationIds.has(text(row, 'applicationId')) &&
        userIds.has(text(row, 'userId')) &&
        applications.find(
          (application) =>
            text(application, 'id') === text(row, 'applicationId'),
        )?.userId !== text(row, 'userId')
      ) {
        mismatchedTransitions += 1;
      }
      if (!valid) {
        invalid += 1;
        return false;
      }
      transitionIds.set(
        text(row, 'id'),
        safeId(text(row, 'id'), transitionIds),
      );
      return true;
    });
    const validMemberships = rawMemberships
      .filter((row) => {
        const valid =
          userIds.has(text(row, 'userId')) &&
          groupIds.has(text(row, 'groupId'));
        if (!valid) invalid += 1;
        return valid;
      })
      .sort(
        (a, b) =>
          date(a, 'createdAt').getTime() - date(b, 'createdAt').getTime(),
      );

    const membershipByUser = new Map<string, string>();
    const membershipIdByUser = new Map<string, string>();
    const membershipDateByUser = new Map<string, Date>();
    const groupCounts = new Map<string, number>();
    const groupIdByName = new Map(
      groups.map((group) => [
        text(group, 'name'),
        groupIds.get(text(group, 'id'))!,
      ]),
    );
    for (const row of validMemberships) {
      const userId = userIds.get(text(row, 'userId'))!;
      const sourceGroupId = groupIds.get(text(row, 'groupId'))!;
      if (membershipByUser.has(userId)) {
        skipped += 1;
        continue;
      }
      let targetGroupId = sourceGroupId;
      if ((groupCounts.get(targetGroupId) || 0) >= 10) {
        targetGroupId = createOverflowGroup();
      }
      membershipByUser.set(userId, targetGroupId);
      membershipIdByUser.set(userId, safeId(text(row, 'id'), membershipIds));
      membershipDateByUser.set(userId, date(row, 'createdAt'));
      groupCounts.set(targetGroupId, (groupCounts.get(targetGroupId) || 0) + 1);
    }
    function createOverflowGroup(): string {
      let index = 1;
      while (groupIdByName.has(`Group ${index}`)) index += 1;
      const name = `Group ${index}`;
      const id = randomUUID();
      groupIdByName.set(name, id);
      groupIds.set(`__generated_group_${id}`, id);
      groups.push({
        id: `__generated_group_${id}`,
        name,
        createdAt: new Date().toISOString(),
      });
      return id;
    }
    for (const user of users) {
      const userId = userIds.get(text(user, 'id'))!;
      if (!membershipByUser.has(userId)) {
        let candidate = groups.find(
          (group) =>
            (groupCounts.get(groupIds.get(text(group, 'id'))!) || 0) < 10,
        );
        if (!candidate) {
          createOverflowGroup();
          candidate = groups.at(-1)!;
        }
        const groupId = groupIds.get(text(candidate, 'id'))!;
        membershipByUser.set(userId, groupId);
        const membershipId = randomUUID();
        membershipIds.set(
          `__generated_membership_${membershipId}`,
          membershipId,
        );
        membershipIdByUser.set(userId, membershipId);
        membershipDateByUser.set(userId, date(user, 'createdAt'));
        groupCounts.set(groupId, (groupCounts.get(groupId) || 0) + 1);
      }
    }

    const counts = {
      users: users.length,
      groups: groups.length,
      memberships: membershipByUser.size,
      applications: applications.length,
      transitions: transitions.length,
      invalid,
      skipped,
      orphanApplications,
      mismatchedTransitions,
      idsRemapped: [
        userIds,
        groupIds,
        applicationIds,
        membershipIds,
        transitionIds,
      ].reduce(
        (sum, map) =>
          sum +
          [...map.entries()].filter(
            ([old, next]) => !old.startsWith('__generated_') && old !== next,
          ).length,
        0,
      ),
    };
    console.log(
      `SQLite import ${apply ? 'plan' : 'dry run'}: ${JSON.stringify(counts)}`,
    );
    if (!apply) {
      console.log(
        'No PostgreSQL data was changed. Re-run with --apply to import after applying migrations.',
      );
      return;
    }

    const targetCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT (SELECT COUNT(*) FROM "users") + (SELECT COUNT(*) FROM "member_groups") +
             (SELECT COUNT(*) FROM "applications") + (SELECT COUNT(*) FROM "memberships") +
             (SELECT COUNT(*) FROM "application_stage_transitions") AS count`;
    if (Number(targetCount[0].count) !== 0)
      throw new Error(
        'Target PostgreSQL tables are not empty; import cancelled without modifying them.',
      );

    await prisma.$transaction(
      async (tx) => {
        for (const row of users) {
          await tx.user.create({
            data: {
              id: userIds.get(text(row, 'id'))!,
              name: text(row, 'name').trim(),
              email: text(row, 'email').trim().toLowerCase(),
              passwordHash: text(row, 'passwordHash'),
              refreshTokenHash:
                row.refreshTokenHash == null
                  ? null
                  : text(row, 'refreshTokenHash'),
              createdAt: date(row, 'createdAt'),
              updatedAt: date(row, 'updatedAt'),
            },
          });
        }
        for (const row of groups) {
          await tx.group.create({
            data: {
              id: groupIds.get(text(row, 'id'))!,
              name: text(row, 'name') || `Group ${groups.indexOf(row) + 1}`,
              createdAt: date(row, 'createdAt'),
            },
          });
        }
        for (const [userId, groupId] of membershipByUser) {
          await tx.membership.create({
            data: {
              id: membershipIdByUser.get(userId)!,
              userId,
              groupId,
              createdAt: membershipDateByUser.get(userId)!,
            },
          });
        }
        for (const row of applications) {
          await tx.application.create({
            data: {
              id: applicationIds.get(text(row, 'id'))!,
              userId: userIds.get(text(row, 'userId'))!,
              companyName: text(row, 'companyName'),
              jobTitle: text(row, 'jobTitle'),
              applicationDate: text(row, 'applicationDate'),
              location: row.location == null ? null : text(row, 'location'),
              applicationMethod:
                row.applicationMethod == null
                  ? null
                  : (text(row, 'applicationMethod') as never),
              jobUrl: row.jobUrl == null ? null : text(row, 'jobUrl'),
              stage: text(row, 'stage') as never,
              outcome: text(row, 'outcome') as never,
              createdAt: date(row, 'createdAt'),
              updatedAt: date(row, 'updatedAt'),
            },
          });
        }
        for (const row of transitions) {
          const applicationId = applicationIds.get(text(row, 'applicationId'))!;
          const userId = userIds.get(text(row, 'userId'))!;
          const application = applications.find(
            (candidate) =>
              applicationIds.get(text(candidate, 'id')) === applicationId,
          );
          if (
            !application ||
            userIds.get(text(application, 'userId')) !== userId
          )
            continue;
          await tx.applicationStageTransition.create({
            data: {
              id: transitionIds.get(text(row, 'id'))!,
              applicationId,
              userId,
              fromStage: text(row, 'fromStage') as never,
              toStage: text(row, 'toStage') as never,
              outcome:
                row.outcome == null ? null : (text(row, 'outcome') as never),
              changedAt: date(row, 'changedAt'),
            },
          });
        }
      },
      { timeout: 120_000 },
    );

    const verified = {
      users: await prisma.user.count(),
      groups: await prisma.group.count(),
      memberships: await prisma.membership.count(),
      applications: await prisma.application.count(),
      transitions: await prisma.applicationStageTransition.count(),
    };
    if (
      verified.users !== counts.users ||
      verified.memberships !== counts.memberships ||
      verified.applications !== counts.applications ||
      verified.transitions !== counts.transitions
    ) {
      throw new Error(
        `Post-import row count mismatch. Imported ${JSON.stringify(verified)}.`,
      );
    }
    console.log(
      `SQLite import complete: ${JSON.stringify({ ...verified, skipped: counts.skipped, invalid: counts.invalid, idsRemapped: counts.idsRemapped })}`,
    );
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected import failure';
  console.error(`SQLite import failed: ${message}`);
  process.exitCode = 1;
});
