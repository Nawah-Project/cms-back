"""One read-only observer for CI and approved deployment. No model polling loops."""
import argparse,json,os,re,shutil,subprocess,time
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['status','wait']);p.add_argument('--repo');p.add_argument('--run',type=int);p.add_argument('--deployment-dir',type=Path);p.add_argument('--component',choices=['api','frontend','admin']);p.add_argument('--tag');p.add_argument('--timeout',type=int,default=1800);args=p.parse_args()
 if args.run and (not args.repo or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repo)):p.error('A repository owner/name is required')
 if args.deployment_dir and (not args.component or not args.tag):p.error('Deployment observation needs component and exact approved tag')
 if not args.run and not args.deployment_dir:p.error('Select a CI run or a deployment')
 gh=shutil.which('gh') or '/data/cms/deployment/bin/gh';deadline=time.monotonic()+args.timeout;previous=None
 while True:
  result={};done=True;failed=False
  if args.run:
   value=subprocess.run([gh,'run','view',str(args.run),'--repo',args.repo,'--json','status,conclusion,headSha,jobs,url'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   if value.returncode:raise RuntimeError('GitHub observation failed; existing build/deployment was not restarted')
   r=json.loads(value.stdout);result['ci']={k:r[k] for k in ['status','conclusion','headSha','url']};result['ci']['activeSteps']=[s['name']for j in r['jobs']for s in j.get('steps',[])if s['status']=='in_progress'];result['ci']['failedSteps']=[{'job':j['name'],'step':s['name']}for j in r['jobs']for s in j.get('steps',[])if s.get('conclusion')=='failure'];done=r['status']=='completed';failed=done and r['conclusion']!='success'
  if args.deployment_dir:
   state=json.loads((args.deployment_dir/'state.json').read_text());component=state.get('components',{}).get(args.component,{})
   complete=component.get('tag')==args.tag and not state.get('pending');bad=state.get('failed',{}).get(args.component)==args.tag
   result['deployment']={'component':args.component,'currentTag':component.get('tag'),'currentCommit':component.get('commit'),'requestedTag':args.tag,'complete':complete,'failed':bad};done=done and complete;failed=failed or bad
  if result!=previous:print(json.dumps(result),flush=True);previous=result
  if args.mode=='status' or done or failed:
   if failed:raise SystemExit(1)
   return
  if time.monotonic()>=deadline:raise TimeoutError('Observation timed out; no build, test or deployment was restarted')
  time.sleep(15)
if __name__=='__main__':main()
