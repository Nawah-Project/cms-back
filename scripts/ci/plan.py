"""Conservative changed-path delivery plan. Unknown/unavailable diffs build everything."""
import argparse,json,os,subprocess
from pathlib import Path
PROFILES={'personal-back':['api'],'personal-front':['frontend'],'nawah-back':['api'],'nawah-front':['frontend','admin']}

def classify(paths,profile,force=False):
 if profile not in PROFILES:raise ValueError('Unknown delivery profile')
 code=ops=False;runtime=[]
 for p in paths:
  if p in ['AGENTS.md','LICENSE','LICENSE.md','.gitignore'] or p.startswith('docs/') or ('/' not in p and p.lower().endswith('.md')):continue
  if p.startswith(('test/','tests/')) or p.endswith(('.spec.ts','.test.ts','checks.mjs')) or p=='scripts/ci/browser-smoke.cjs':code=True;continue
  if p.startswith(('ops/','scripts/deployment/','scripts/backup/','scripts/release/','scripts/ci/')) or p in ['.github/workflows/ops.yaml','.github/workflows/approve-production.yaml']:ops=True;continue
  code=True;runtime.append(p)
 if force:code=ops=True;runtime=['Dockerfile']
 components=PROFILES[profile]
 if profile=='nawah-front' and runtime and all(p.startswith('src/app/features/admin/') for p in runtime):components=['admin']
 return {'code':code,'ops':ops,'runtime':bool(runtime),'components':components,'schema':any(p.startswith('prisma/') for p in paths),'changedFiles':len(paths),'unknownDiff':False}

def make_plan(profile,event,head,root=Path('.')):
 force=str(event.get('inputs',{}).get('full_build','false')).lower()=='true'
 base=event.get('pull_request',{}).get('base',{}).get('sha') or event.get('before')
 if not base or set(base)=={'0'}:
  p=subprocess.run(['git','rev-parse',head+'^'],cwd=root,capture_output=True,text=True);base=p.stdout.strip() if p.returncode==0 else None
 result=None
 if base:
  p=subprocess.run(['git','diff','--no-renames','--name-only','-z',base,head],cwd=root,capture_output=True)
  if p.returncode==0:result=classify([s.decode('utf8') for s in p.stdout.split(b'\0') if s],profile,force)
 if result is None:result=classify(['Dockerfile'],profile,True);result['unknownDiff']=True
 result.update(base=base,head=head)
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument('--profile',required=True,choices=PROFILES);a=p.parse_args()
 event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text());head=os.environ['GITHUB_SHA'];result=make_plan(a.profile,event,head)
 result['images']=result['runtime'] and os.environ['GITHUB_EVENT_NAME']!='pull_request'
 apps={'frontend':{'component':'frontend','app':'member','probe':'/auth/login'},'admin':{'component':'admin','app':'admin','probe':'/admin'}}
 result['matrix']={'include':[apps[x] for x in result['components'] if x in apps]}
 with open(os.environ['GITHUB_OUTPUT'],'a') as f:
  for k in ['code','ops','images','schema']:f.write(k+'='+str(result[k]).lower()+'\n')
  f.write('matrix='+json.dumps(result['matrix'],separators=(',',':'))+'\n')
 with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:
  f.write('## Delivery plan\n\n'+f"Changed files: {result['changedFiles']}. Code checks: {result['code']}. Operator checks: {result['ops']}. Docker images: {result['components'] if result['images'] else 'none'}. Schema change: {result['schema']}.\n\nPRs compile/test source; production images are built once after main changes. Approval never rebuilds.\n")
 print(json.dumps(result))
if __name__=='__main__':main()
