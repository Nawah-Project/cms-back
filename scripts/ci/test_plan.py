import json,subprocess,tempfile,unittest
from pathlib import Path
from plan import classify,make_plan
class PlanTests(unittest.TestCase):
 def test_docs_do_not_build_or_test_unchanged_apps(self):
  for p in ['personal-back','personal-front','nawah-back','nawah-front']:
   r=classify(['README.md','AGENTS.md','docs/delivery.md'],p);self.assertFalse(r['runtime'] or r['code'] or r['ops'])
 def test_ops_and_release_changes_do_not_build_application_images(self):
  for p in ['personal-back','nawah-back']:
   r=classify(['ops/agent.py','scripts/release/release.py','scripts/ci/plan.py'],p);self.assertTrue(r['ops']);self.assertFalse(r['runtime'] or r['code'])
 def test_unknown_and_shared_paths_build_all_components(self):
  for path in ['new-root-file','src/app/root.tsx','server.mjs','Dockerfile','package-lock.json','.github/workflows/ci_cd.yaml']:
   r=classify([path],'nawah-front');self.assertTrue(r['runtime']);self.assertEqual(r['components'],['frontend','admin'])
 def test_only_owned_admin_changes_select_admin(self):
  self.assertEqual(classify(['src/app/features/admin/AdminLayout.tsx'],'nawah-front')['components'],['admin'])
  self.assertEqual(classify(['src/app/features/admin/page.tsx','src/app/components/shared.tsx'],'nawah-front')['components'],['frontend','admin'])
 def test_test_changes_keep_checks_without_an_image(self):
  for path in ['src/identity/crypto.spec.ts','test/identity.e2e-spec.ts','scripts/auth-setup-checks.mjs','scripts/ci/browser-smoke.cjs']:
   r=classify([path],'personal-back');self.assertTrue(r['code']);self.assertFalse(r['runtime'])
 def test_migrations_force_runtime_and_schema_checks(self):
  r=classify(['prisma/migrations/new/migration.sql'],'personal-back');self.assertTrue(r['runtime'] and r['schema'])
 def test_force_and_unknown_diff_are_conservative(self):
  self.assertTrue(classify(['docs/x.md'],'personal-front',True)['runtime'])
  with tempfile.TemporaryDirectory() as t:
   r=make_plan('personal-back',{},'not-a-commit',Path(t));self.assertTrue(r['runtime'] and r['unknownDiff'])
 def test_git_diff_covers_deleted_and_renamed_paths(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t)
   def git(*args):return subprocess.check_output(['git','-C',t,*args],stderr=subprocess.DEVNULL).decode().strip()
   git('init');git('config','user.email','ci@example.invalid');git('config','user.name','CI fixture')
   (root/'shared.ts').write_text('export const x=1');git('add','.');git('commit','-m','base');base=git('rev-parse','HEAD')
   (root/'shared.ts').rename(root/'README.md');git('add','-A');git('commit','-m','rename');head=git('rev-parse','HEAD')
   r=make_plan('nawah-front',{'before':base},head,root);self.assertTrue(r['runtime']);self.assertEqual(r['components'],['frontend','admin'])
if __name__=='__main__':unittest.main()
