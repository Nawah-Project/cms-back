#!/usr/bin/env python3
"""Outbound-only approved-release deployer. No build, package install, or image pull."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPOS = {'frontend': 'Nawah-Project/cms-front', 'api': 'Nawah-Project/cms-back'}
TAG = re.compile(r'build-([0-9a-f]{40})-[0-9]+-[0-9]+\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')

class DeployError(Exception): pass
class PermanentError(DeployError): pass

def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w') as f:
        os.chmod(tmp, 0o600); json.dump(value, f, indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
    tmp.replace(path)

def digest(path):
    with path.open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()

def command(args, **kwargs):
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if r.returncode: raise DeployError(f'Command {args[0]} failed ({r.returncode}); diagnostics withheld to protect environment values')
    return r.stdout

def get_json(url, absent_ok=False):
    request = urllib.request.Request(url, headers={'User-Agent': 'nawah-deployment', 'Accept': 'application/vnd.github+json'})
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            raw = r.read(262145)
            if len(raw) > 262144: raise PermanentError('Release metadata is too large')
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        if absent_ok and e.code == 404: return None
        raise DeployError(f'Metadata request failed ({e.code})') from None

def asset(release, name, repo):
    matches = [a for a in release['assets'] if a['name'] == name]
    if len(matches) != 1: raise PermanentError(f'Missing or duplicate {name}')
    url = matches[0]['browser_download_url']
    prefix = f'https://github.com/{repo}/releases/download/{release["tag_name"]}/'
    if url != prefix + name: raise PermanentError('Unexpected release asset origin')
    return matches[0]

def validate(repo, component, release, manifest, approval):
    match = TAG.fullmatch(release['tag_name'])
    if not match or release['draft']: raise PermanentError('Invalid candidate tag or draft')
    if manifest.get('schema') != 1 or manifest.get('repository') != repo or manifest.get('component') != component:
        raise PermanentError('Release belongs to another repository or service')
    if manifest.get('tag') != release['tag_name'] or manifest.get('commit') != match[1]:
        raise PermanentError('Release commit mismatch')
    if manifest.get('architecture') != 'amd64' or not HASH.fullmatch(manifest.get('archiveSha256', '')):
        raise PermanentError('Invalid archive metadata')
    if not isinstance(manifest.get('archiveBytes'), int) or not 0 < manifest['archiveBytes'] < 2 * 1024**3:
        raise PermanentError('Invalid archive size')
    if not re.fullmatch('sha256:[0-9a-f]{64}', manifest.get('imageId', '')):
        raise PermanentError('Invalid Docker image ID')
    if manifest.get('imageRef') != f'nawah/{component}:sha-{manifest["commit"]}':
        raise PermanentError('Unexpected image reference')
    if not isinstance(manifest.get('migrations'), dict) or any(not HASH.fullmatch(h) for h in manifest['migrations'].values()):
        raise PermanentError('Invalid migration checksums')
    for key in ['repository', 'tag', 'commit', 'archiveSha256']:
        if approval.get(key) != manifest.get(key): raise PermanentError('Approval does not match candidate')
    if approval.get('schema') != 1 or not approval.get('actor'): raise PermanentError('Approval is missing')

class Agent:
    def __init__(self, directory):
        self.root = Path(directory).resolve()
        self.config = json.loads((self.root/'config.json').read_text())
        self.state_path = self.root/'state.json'
        self.state = json.loads(self.state_path.read_text())

    def event(self, component, kind, **details):
        record = {'at': datetime.now(timezone.utc).isoformat(), 'component': component, 'event': kind, **details}
        with (self.root/'events.jsonl').open('a') as f: f.write(json.dumps(record) + '\n')
        print(json.dumps(record), flush=True)

    def save(self): atomic(self.state_path, self.state)

    def compose(self, override, *args):
        cmd = ['docker', 'compose', '--project-name', self.config['project'], '--env-file', self.config['envFile']]
        for path in self.config['composeFiles']: cmd += ['-f', path]
        return cmd + ['-f', str(override), *args]

    def image_override(self, images, destination):
        # JSON is valid YAML; only service images can change.
        atomic(destination, {'services': {name: {'image': image} for name, image in images.items()}})

    def inventory(self):
        names = list(self.config['containers'].values())
        return {c['Name'].lstrip('/'): c for c in json.loads(command(['docker', 'inspect', *names]))}

    def latest(self, component, tag=None):
        repo = REPOS[component]
        path = '/releases/tags/' + tag if tag else '/releases/latest'
        release = get_json(f'https://api.github.com/repos/{repo}{path}', absent_ok=True)
        if release is None: return None
        if not tag and release['prerelease']: raise PermanentError('Latest production release is a prerelease')
        ma = asset(release, 'release.json', repo); aa = asset(release, 'approval.json', repo) if not tag else None
        m = get_json(ma['browser_download_url'])
        approval = get_json(aa['browser_download_url']) if aa else {
            'schema': 1, 'actor': 'stage-only', **{k: m[k] for k in ['repository','tag','commit','archiveSha256']}}
        validate(repo, component, release, m, approval)
        archive = asset(release, 'image.tar.gz', repo)
        if archive['size'] != m['archiveBytes']: raise PermanentError('Archive size disagrees with manifest')
        return release, m, approval, archive

    def stage(self, component, data):
        release, m, approval, archive = data
        folder = self.root/'cache'/component/m['tag']; folder.mkdir(parents=True, exist_ok=True)
        final, partial = folder/'image.tar.gz', folder/'image.tar.gz.part'
        if final.exists() and final.stat().st_size == m['archiveBytes'] and digest(final) == m['archiveSha256']:
            return final
        free = shutil.disk_usage(self.root).free
        if free < max(2*1024**3, m['archiveBytes'] * 3): raise DeployError('Insufficient free space to stage release safely')
        if partial.exists() and partial.stat().st_size > m['archiveBytes']: partial.unlink()
        started = time.monotonic()
        self.event(component, 'download_started', tag=m['tag'], compressedBytes=m['archiveBytes'], bytesPerSecond=1048576)
        cmd = ['curl','--fail','--location','--silent','--show-error','--proto','=https','--proto-redir','=https',
            '--limit-rate','1M','--connect-timeout','20','--max-time','7200','--retry','2','--retry-delay','3',
            '--continue-at','-','--output',str(partial),archive['browser_download_url']]
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode: raise DeployError(f'Download interrupted ({result.returncode}); partial file retained')
        if partial.stat().st_size != m['archiveBytes'] or digest(partial) != m['archiveSha256']:
            partial.unlink(); raise PermanentError('Archive checksum failed; no container changed')
        partial.replace(final)
        self.event(component, 'download_verified', tag=m['tag'], seconds=round(time.monotonic()-started,2), compressedBytes=m['archiveBytes'])
        return final

    def load(self, component, data, archive):
        m = data[1]
        command(['docker','image','load','--input',str(archive)])
        image = json.loads(command(['docker','image','inspect',m['imageRef']]))[0]
        if image['Id'] != m['imageId'] or image['Architecture'] != 'amd64': raise PermanentError('Loaded image identity mismatch')
        if image['Config'].get('Labels',{}).get('org.opencontainers.image.revision') != m['commit']:
            raise PermanentError('Loaded image revision mismatch')
        self.event(component,'image_staged',tag=m['tag'],imageId=m['imageId'])

    def migration_check(self, m, approval):
        sql = 'SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
        output = command(['docker','exec',self.config['containers']['postgres'],'sh','-c',
            'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "$1"','sh',sql]).decode()
        existing = dict(line.split('|',1) for line in output.splitlines() if line)
        for name,value in existing.items():
            proposed=m['migrations'].get(name)
            if proposed==value:continue
            legacy=self.config.get('legacyMigrationChecksums',{}).get(name,{})
            if legacy.get('databaseChecksum')==value and legacy.get('imageChecksum')==proposed:continue
            raise PermanentError('API migration history differs from production; refusing schema downgrade or edited migrations')
        pending = set(m['migrations'])-set(existing)
        if pending and approval.get('compatibleMigrations') is not True:
            raise PermanentError('New migrations require explicit backward-compatibility approval')
        return pending

    def backup(self, component, tag):
        folder = self.root/'backups'; folder.mkdir(exist_ok=True,mode=0o700)
        path = folder/f'{tag}.dump'; temporary = path.with_suffix('.part')
        with temporary.open('wb') as f:
            os.chmod(temporary,0o600)
            r = subprocess.run(['docker','exec',self.config['containers']['postgres'],'sh','-c',
                'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],stdout=f,stderr=subprocess.PIPE)
        with temporary.open('rb') as f: magic = f.read(5)
        if r.returncode or magic != b'PGDMP': raise DeployError('Pre-release database backup failed')
        with temporary.open('rb') as f:
            r = subprocess.run(['docker','exec','-i',self.config['containers']['postgres'],'pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        if r.returncode: raise DeployError('Database backup verification failed')
        temporary.replace(path); self.event(component,'database_backed_up',tag=tag,bytes=path.stat().st_size)

    def prune(self, component):
        current=self.state['components'][component]
        keep={current['imageRef'],current.get('previous',{}).get('imageRef')}
        tags=command(['docker','image','ls',f'nawah/{component}','--format','{{.Repository}}:{{.Tag}}']).decode().splitlines()
        for tag in tags:
            if tag not in keep and re.fullmatch(f'nawah/{component}:sha-[0-9a-f]{{40}}',tag):
                # No force, no prune, no deletion of volumes or another repository's images.
                subprocess.run(['docker','image','rm',tag],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        retained={current.get('tag'),current.get('previous',{}).get('tag')}
        cache=self.root/'cache'/component
        if cache.exists():
            for folder in cache.iterdir():
                if folder.name not in retained and TAG.fullmatch(folder.name) and folder.is_dir() and not folder.is_symlink():
                    shutil.rmtree(folder)
        backups=self.root/'backups'
        if backups.exists():
            owned=sorted((p for p in backups.glob('build-*.dump') if TAG.fullmatch(p.stem)),key=lambda p:p.stat().st_mtime,reverse=True)
            for old in owned[5:]:old.unlink()

    def healthy(self, component):
        for url in dict.fromkeys([self.config['healthUrls'][component], self.config['healthUrls']['api'], self.config['healthUrls']['frontend']]):
            req = urllib.request.Request(url,headers={'User-Agent':'nawah-deployment-health'})
            with urllib.request.urlopen(req,timeout=10) as r:
                if r.status != 200: raise DeployError('Post-release health probe failed')

    def apply(self, component, data):
        release,m,approval,_ = data
        self.healthy(component)
        before = self.inventory(); current = self.state['components'][component]
        images = {name:value['imageRef'] for name,value in self.state['components'].items()}
        old_images = dict(images); images[component] = m['imageRef']
        proposed = self.root/'proposed-images.json'; self.image_override(images,proposed)
        active = self.root/'production-images.json'
        # Verify that layering this override preserves every non-image Compose setting.
        old_config = json.loads(command(self.compose(active,'config','--format','json')))
        new_config = json.loads(command(self.compose(proposed,'config','--format','json')))
        for config in [old_config,new_config]:
            for name in ['api','frontend']: config['services'][name].pop('image',None)
        if old_config != new_config: raise PermanentError('Proposed deployment changes non-image settings')
        if component == 'api':
            pending = self.migration_check(m,approval)
            self.backup(component,m['tag'])
            self.event(component,'migrations_checked',pending=len(pending))
        previous_file = self.root/'rollback-images.json'; self.image_override(old_images,previous_file)
        # Save rollback information before replacing any container; retry recovery after a crash.
        self.state['pending']={'component':component,'tag':m['tag'],'oldImages':old_images}
        self.save(); started=time.monotonic()
        try:
            command(self.compose(proposed,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','180',component))
            self.healthy(component)
            after=self.inventory()
            for service,name in self.config['containers'].items():
                if service != component and after[name]['Id'] != before[name]['Id']:
                    raise DeployError('A non-target container changed unexpectedly')
            api_name=self.config['containers']['api']
            if before[api_name]['Mounts'] != after[api_name]['Mounts']: raise DeployError('CV storage mounts changed')
            if after[self.config['containers'][component]]['Image'] != m['imageId']: raise DeployError('Running image does not match candidate')
        except Exception:
            try:
                command(self.compose(previous_file,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','180',component))
                self.healthy(component)
                self.state.pop('pending',None); self.save()
                self.event(component,'rolled_back',failedTag=m['tag'])
            except Exception:
                self.event(component,'rollback_failed',failedTag=m['tag']); raise DeployError('Rollback needs operator attention; recovery state retained') from None
            raise PermanentError('Candidate failed health checks and was rolled back') from None
        self.image_override(images,active)
        self.state['components'][component]={'imageRef':m['imageRef'],'imageId':m['imageId'],'tag':m['tag'],
            'commit':m['commit'],'previous':{k:v for k,v in current.items() if k!='previous'}}
        self.state.pop('pending',None); self.state.get('failed',{}).pop(component,None); self.save()
        self.event(component,'deployed',tag=m['tag'],commit=m['commit'],seconds=round(time.monotonic()-started,2))
        try:self.prune(component)
        except DeployError:self.event(component,'cleanup_deferred')

    def recover(self):
        pending=self.state.get('pending')
        if not pending: return
        path=self.root/'recovery-images.json';self.image_override(pending['oldImages'],path)
        command(self.compose(path,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','180',pending['component']))
        self.healthy(pending['component']);self.image_override(pending['oldImages'],self.root/'production-images.json')
        self.state.pop('pending');self.save();self.event(pending['component'],'crash_recovery_complete')

    def run(self, mode, component=None, tag=None, retry=False):
        if mode=='poll' and not self.config.get('enabled'):
            self.event('all','disabled_waiting_for_first_candidate');return
        if mode in ['poll','apply']: self.recover()
        elif self.state.get('pending'): raise DeployError('A previous interrupted deployment needs recovery before staging')
        for name in ([component] if component else list(REPOS)):
            data=self.latest(name,tag)
            if not data: self.event(name,'no_approved_release');continue
            m=data[1]
            if mode=='poll' and self.state['components'][name].get('tag')==m['tag']: continue
            if mode=='poll' and self.state.get('failed',{}).get(name)==m['tag'] and not retry: continue
            try:
                if mode=='check':self.event(name,'candidate_available',tag=m['tag']);continue
                archive=self.stage(name,data);self.load(name,data,archive)
                if mode=='stage':continue
                self.apply(name,data)
            except PermanentError as e:
                self.state.setdefault('failed',{})[name]=m['tag'];self.save();self.event(name,'candidate_rejected',tag=m['tag'],reason=str(e))
                if mode!='poll':raise
            except Exception as e:
                self.event(name,'transient_failure',tag=m['tag'],reason=str(e) if isinstance(e,DeployError) else type(e).__name__)
                if mode!='poll':raise

def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['check','stage','apply','poll']);p.add_argument('--directory',default='/data/cms/deployment')
    p.add_argument('--component',choices=REPOS);p.add_argument('--tag');p.add_argument('--retry',action='store_true');a=p.parse_args()
    if a.tag and (a.mode not in ['check','stage'] or not TAG.fullmatch(a.tag)):p.error('Explicit tags are stage/check only; production applies only approved latest releases')
    root=Path(a.directory);root.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (root/'agent.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('Another deployment/download is running');return
        Agent(root).run(a.mode,a.component,a.tag,a.retry)

if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e) if isinstance(e,DeployError) else f'Deployment failed: {type(e).__name__}',file=sys.stderr);sys.exit(1)
