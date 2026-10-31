#!/usr/bin/env python3
"""Capture the live image-only deployment baseline without recreating containers."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from agent import atomic, command

def migration_baseline(settings):
    sql='SELECT migration_name,checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
    raw=command(['docker','exec',settings['containers']['postgres'],'sh','-c',
        'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "$1"','sh',sql]).decode()
    applied=dict(line.split('|',1) for line in raw.splitlines() if line)
    script='const fs=require("fs"),c=require("crypto"),p="/app/prisma/migrations";console.log(JSON.stringify(Object.fromEntries(fs.readdirSync(p).filter(n=>fs.existsSync(p+"/"+n+"/migration.sql")).map(n=>[n,c.createHash("sha256").update(fs.readFileSync(p+"/"+n+"/migration.sql")).digest("hex")]))))'
    files=json.loads(command(['docker','exec',settings['containers']['api'],'node','-e',script]))
    if any(n not in files for n in applied):raise ValueError('Running API is missing an applied migration')
    return {n:{'databaseChecksum':h,'imageChecksum':files[n]} for n,h in applied.items() if files[n]!=h}

def install(root):
    root = Path(root).resolve(); root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (root/'config.json').exists(): raise ValueError('Already initialized; refusing to replace deployment state')
    objects = json.loads(command(['docker','inspect','cms-front','cms-api','cms-postgres-db']))
    containers = {x['Name'].lstrip('/'): x for x in objects}
    front = containers['cms-front']; api = containers['cms-api']
    labels = front['Config']['Labels']
    files = labels['com.docker.compose.project.config_files'].split(',')
    if not all(Path(p).is_file() for p in files): raise ValueError('A live Compose override is missing')
    settings = {'enabled': False, 'project': labels['com.docker.compose.project'],
        'composeFiles': files, 'envFile': '/data/cms-back/.env',
        'containers': {'frontend':'cms-front','api':'cms-api','postgres':'cms-postgres-db'},
        'healthUrls': {'frontend':'http://127.0.0.1:8080/auth/login','api':'http://127.0.0.1:3000/health'}}
    state = {'components': {name:{'imageRef':c['Config']['Image'],'imageId':c['Image'],'tag':None}
        for name,c in [('frontend',front),('api',api)]}, 'baselineContainerIds':{k:v['Id'] for k,v in containers.items()}}
    proposed = root/'production-images.json'
    atomic(proposed, {'services': {name:{'image':c['imageRef']} for name,c in state['components'].items()}})
    # Compare effective settings to live container identity without printing secrets.
    args = ['docker','compose','--project-name',settings['project'],'--env-file',settings['envFile']]
    for p in files: args += ['-f',p]
    config = json.loads(command(args + ['-f',str(proposed),'config','--format','json']))
    for service,c in [('frontend',front),('api',api)]:
        env = dict(e.split('=',1) for e in c['Config']['Env'])
        for key,value in config['services'][service].get('environment',{}).items():
            if str(value) != env.get(key): raise ValueError(f'Effective {service} environment differs from live container; baseline must be reconciled')
    settings['legacyMigrationChecksums']=migration_baseline(settings)
    atomic(root/'config.json',settings);atomic(root/'state.json',state)
    shutil.copy2(Path(__file__).with_name('agent.py'),root/'agent.py')
    for name in ['cache','backups']: (root/name).mkdir(mode=0o700,exist_ok=True)
    print('Captured production baseline; polling remains disabled until a candidate has been staged.')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',default='/data/cms/deployment');p.add_argument('--record-existing-migration-checksums',action='store_true');a=p.parse_args()
    try:
        if a.record_existing_migration_checksums:
            root=Path(a.directory);config=json.loads((root/'config.json').read_text());state=json.loads((root/'state.json').read_text())
            if config['enabled'] or state['components']['api']['tag'] is not None or config.get('legacyMigrationChecksums'):
                raise ValueError('Migration baseline can only be recorded once before activation')
            current=json.loads(command(['docker','inspect',config['containers']['api']]))[0]
            if current['Image']!=state['components']['api']['imageId']:raise ValueError('Baseline API image has changed')
            config['legacyMigrationChecksums']=migration_baseline(config);atomic(root/'config.json',config)
            print('Recorded exact existing migration checksum pairs; database not modified')
        else:install(a.directory)
    except Exception as e:print(str(e) if isinstance(e,ValueError) else type(e).__name__,file=sys.stderr);sys.exit(1)
