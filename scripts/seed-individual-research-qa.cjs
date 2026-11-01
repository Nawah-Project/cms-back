// Explicitly disposable database only. Adds synthetic identities; never copies or resets data.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
(async () => {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.INDIVIDUAL_QA_CONFIRM !== 'SYNTHETIC_ONLY' ||
    new URL(process.env.DATABASE_URL).pathname !== '/cms_test'
  )
    throw new Error('Refusing synthetic seed outside confirmed cms_test');
  const p = new PrismaClient();
  try {
    const [{ name }] = await p.$queryRaw`SELECT current_database() as name`;
    if (name !== 'cms_test') throw new Error('Unexpected database');
    const password = 'SyntheticBrowser123!',
      passwordHash = await bcrypt.hash(password, 4),
      run = randomUUID().slice(0, 8),
      users = {};
    for (const [key, adminPermissions, root] of [
      ['root', {}, true],
      ['reader', { INDIVIDUAL_RESEARCH: 'READ' }, false],
      ['outsider', { INDIVIDUAL_RESEARCH: 'WRITE' }, false],
      ['participant', null, false],
    ]) {
      const u = await p.user.create({
        data: {
          name: `Studio QA ${key} ${run}`,
          email: `studio-${key}-${run}@example.invalid`,
          passwordHash,
          emailVerified: true,
          targetJobTitle: 'Software Engineer',
          portfolioUrl: 'https://example.com/synthetic',
          ...(adminPermissions
            ? { role: 'ADMIN', isRootAdmin: root, adminPermissions }
            : {}),
        },
      });
      {
        await p.userCv.create({
          data: {
            userId: u.id,
            originalName: 'synthetic-browser.pdf',
            mimeType: 'application/pdf',
            size: 12,
            storageKey: `synthetic-${u.id}.pdf`,
          },
        });
        await p.userJourneyState.create({
          data: { userId: u.id, currentWeek: 0, currentNodeCode: 'TASK_0' },
        });
      }
      users[key] = { id: u.id, name: u.name, email: u.email, password };
    }
    console.log(JSON.stringify({ run, users }));
  } finally {
    await p.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
