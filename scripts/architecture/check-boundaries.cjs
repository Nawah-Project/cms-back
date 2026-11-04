const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../src');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
for (const file of walk(root).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
  const relative = path.relative(root, file), source = fs.readFileSync(file, 'utf8').replace(/\/\/[^\n]*/g, '');
  if (relative.startsWith('founder-workspace/')) {
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const target = path.relative(root, path.resolve(path.dirname(file), match[1]));
      assert.ok(target.startsWith('founder-workspace/') || target.startsWith('platform/access/') || (relative.includes('/infrastructure/') && target === 'prisma/prisma.service'), `Forbidden founder dependency: ${relative} -> ${target}`);
    }
    if (relative.includes('/domain/')) assert.ok(!/\bPrisma|@nestjs|AuthService|AdminService|fetch\s*\(/.test(source), relative);
    if (!relative.includes('/infrastructure/')) assert.ok(!/PrismaService|\$transaction|\.user\.(find|update)|\.careerConsulting/.test(source), relative);
  } else if (relative !== 'app.module.ts') {
    assert.ok(!/from\s+['"][^'"]*founder-workspace\//.test(source), `Incoming feature dependency: ${relative}`);
    assert.ok(!/\.founderWorkspace(?:Mutation)?\./.test(source), `Foreign data access: ${relative}`);
  }
}
console.log('Founder workspace domain, data ownership, and incoming dependencies verified.');

for(const file of walk(root).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts'))){
 const relative=path.relative(root,file),source=fs.readFileSync(file,'utf8');
 if(relative.startsWith('strategic-relationships/')){
  for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(!match[1].startsWith('.'))continue;const target=path.relative(root,path.resolve(path.dirname(file),match[1]));assert.ok(target.startsWith('strategic-relationships/')||target.startsWith('platform/access/')||(relative.includes('/infrastructure/')&&target==='prisma/prisma.service'),`Forbidden relationships dependency: ${relative} -> ${target}`);}
  if(relative.includes('/domain/'))assert.ok(!/Prisma|@nestjs|fetch\s*\(/.test(source),relative);
  if(!relative.includes('/infrastructure/'))assert.ok(!/PrismaService|\$transaction|\.user\.(find|update)/.test(source),relative);
 }else if(relative!=='app.module.ts'){assert.ok(!/from\s+['"][^'"]*strategic-relationships\//.test(source),relative);assert.ok(!/\.strategicRelationships(?:Workspace|Mutation)\./.test(source),relative);}
}
console.log('Strategic relationships data ownership and replaceable module boundary verified.');

for(const file of walk(root).filter(f=>f.endsWith('.ts')&&!f.endsWith('.spec.ts'))){
 const relative=path.relative(root,file),source=fs.readFileSync(file,'utf8');
 if(relative.startsWith('learning-library/')){
  for(const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(!m[1].startsWith('.'))continue;const target=path.relative(root,path.resolve(path.dirname(file),m[1]));assert.ok(target.startsWith('learning-library/')||target.startsWith('platform/access/')||(relative.includes('/infrastructure/')&&target==='prisma/prisma.service'),`Forbidden learning dependency: ${relative} -> ${target}`);}
  if(relative.includes('/domain/'))assert.ok(!/PrismaService|@nestjs|fetch\s*\(/.test(source),relative);
  if(!relative.includes('/infrastructure/'))assert.ok(!/PrismaService|\$transaction|\.user\.(find|update)/.test(source),relative);
 }else if(relative!=='app.module.ts'){assert.ok(!/from\s+['"][^'"]*learning-library\//.test(source),relative);assert.ok(!/\.learning(?:Library|Book|Edition|Note|Map|Goal|Reading|Position|Asset|Mutation)\./.test(source),relative);}
}
console.log('Learning library resource ownership and replaceable module boundary verified.');
