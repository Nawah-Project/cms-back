import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import agent

SHA='a'*40
TAG=f'build-{SHA}-12-1'
IMAGE='sha256:'+'1'*64

def candidate(component='frontend', sha=SHA, tag=TAG, content=b'complete compressed archive'):
    m={'schema':1,'repository':agent.REPOS[component],'component':component,'commit':sha,'tag':tag,
       'architecture':'amd64','archiveBytes':len(content),'archiveSha256':__import__('hashlib').sha256(content).hexdigest(),
       'imageRef':f'nawah/{component}:sha-{sha}','imageId':IMAGE,'migrations':{}}
    approval={'schema':1,'actor':'release-owner',**{k:m[k] for k in ['repository','commit','tag','archiveSha256']}}
    release={'tag_name':tag,'draft':False,'prerelease':False}
    archive={'browser_download_url':f'https://github.com/{m["repository"]}/releases/download/{tag}/image.tar.gz','size':len(content)}
    return release,m,approval,archive

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.config={'enabled':True,'project':'test-only','composeFiles':['/test/compose.yml'],'envFile':'/test/production.env',
            'containers':{'frontend':'cms-front','api':'cms-api','postgres':'cms-postgres-db'},
            'healthUrls':{'frontend':'http://127.0.0.1:8080/auth/login','api':'http://127.0.0.1:3000/health'}}
        self.state={'components':{'frontend':{'imageRef':'old/front:good','imageId':'old-front','tag':'old'},
                                  'api':{'imageRef':'old/api:good','imageId':'old-api','tag':'old'}}}
        agent.atomic(self.root/'config.json',self.config);agent.atomic(self.root/'state.json',self.state)
        agent.atomic(self.root/'production-images.json',{'services':{k:{'image':v['imageRef']} for k,v in self.state['components'].items()}})
        self.a=agent.Agent(self.root)

    def test_wrong_repository_commit_and_approval_are_rejected(self):
        for mutate in [lambda d:d[1].update(repository='Other/project'),lambda d:d[1].update(commit='b'*40),
                       lambda d:d[2].update(archiveSha256='0'*64),lambda d:d[1].update(imageRef='evil/image:tag')]:
            d=list(candidate());mutate(d)
            with self.assertRaises(agent.PermanentError):agent.validate(agent.REPOS['frontend'],'frontend',*d[:3])

    def test_explicit_asset_origin_and_size(self):
        d=candidate();d[0]['assets']=[{'name':'image.tar.gz','browser_download_url':'https://example.invalid/image.tar.gz'}]
        with self.assertRaises(agent.PermanentError):agent.asset(d[0],'image.tar.gz',agent.REPOS['frontend'])
        d=candidate();d[1]['archiveBytes']=3*1024**3
        with self.assertRaises(agent.PermanentError):agent.validate(agent.REPOS['frontend'],'frontend',*d[:3])

    def test_interruption_retains_partial_and_next_download_resumes_with_rate_cap(self):
        d=candidate();calls=[]
        def interrupted(args,**kw):
            calls.append(args);Path(args[args.index('--output')+1]).write_bytes(b'complete ')
            return subprocess.CompletedProcess(args,18)
        with patch.object(agent.subprocess,'run',side_effect=interrupted):
            with self.assertRaises(agent.DeployError):self.a.stage('frontend',d)
        def resumed(args,**kw):
            calls.append(args);p=Path(args[args.index('--output')+1]);self.assertEqual(p.read_bytes(),b'complete ')
            p.write_bytes(b'complete compressed archive');return subprocess.CompletedProcess(args,0)
        with patch.object(agent.subprocess,'run',side_effect=resumed):p=self.a.stage('frontend',d)
        self.assertEqual(p.read_bytes(),b'complete compressed archive')
        for args in calls:
            self.assertIn('--continue-at',args);self.assertEqual(args[args.index('--limit-rate')+1],'1M')
        self.assertEqual(self.a.state,self.state)

    def test_invalid_archive_never_changes_container_or_current_release(self):
        d=candidate()
        def bad(args,**kw):
            Path(args[args.index('--output')+1]).write_bytes(b'corrupt');return subprocess.CompletedProcess(args,0)
        with patch.object(agent.subprocess,'run',side_effect=bad):
            with self.assertRaises(agent.PermanentError):self.a.stage('frontend',d)
        self.assertEqual(self.a.state,self.state)
        self.assertFalse((self.root/'cache/frontend'/TAG/'image.tar.gz.part').exists())

    def inventory(self,new=False):
        return {'cms-front':{'Id':'new-front' if new else 'front','Image':IMAGE if new else 'old-front','Mounts':[]},
                'cms-api':{'Id':'api','Image':'old-api','Mounts':[{'Name':'private-cvs','Destination':'/app/private-storage/cvs'}]},
                'cms-postgres-db':{'Id':'database','Image':'postgres','Mounts':[{'Name':'db-volume'}]}}

    def test_frontend_deploy_is_image_only_and_preserves_api_db_and_cvs(self):
        commands=[]
        def command(args,**kw):
            commands.append(args)
            if 'config' in args:return json.dumps({'services':{'frontend':{'image':'ignored','environment':{'unchanged':'yes'}},'api':{'image':'same'}}}).encode()
            return b''
        with patch.object(agent,'command',side_effect=command),patch.object(self.a,'inventory',side_effect=[self.inventory(),self.inventory(True)]),patch.object(self.a,'healthy'):
            self.a.apply('frontend',candidate())
        for args in [c for c in commands if 'up' in c]:
            self.assertEqual(args[-1],'frontend');self.assertIn('--no-build',args);self.assertIn('--no-deps',args)
            self.assertEqual(args[args.index('--pull')+1],'never')
        self.assertEqual(self.a.state['components']['api'],self.state['components']['api'])
        self.assertEqual(self.a.state['components']['frontend']['previous']['imageRef'],'old/front:good')

    def test_failed_health_rolls_back_to_existing_image_and_retains_original_state(self):
        commands=[]
        def command(args,**kw):
            commands.append(args)
            return json.dumps({'services':{'frontend':{},'api':{}}}).encode() if 'config' in args else b''
        with patch.object(agent,'command',side_effect=command),patch.object(self.a,'inventory',return_value=self.inventory()),patch.object(self.a,'healthy',side_effect=[None,agent.DeployError('unhealthy'),None]):
            with self.assertRaises(agent.PermanentError):self.a.apply('frontend',candidate())
        self.assertEqual(self.a.state['components'],self.state['components']);self.assertNotIn('pending',self.a.state)
        self.assertEqual(len([c for c in commands if 'up' in c]),2)
        rollback=json.loads((self.root/'rollback-images.json').read_text())
        self.assertEqual(rollback['services']['frontend']['image'],'old/front:good')

    def test_two_successive_releases_keep_exact_previous_version(self):
        with patch.object(agent,'command',side_effect=lambda args,**kw:json.dumps({'services':{'frontend':{},'api':{}}}).encode() if 'config' in args else b''),patch.object(self.a,'inventory',side_effect=[self.inventory(),self.inventory(True),self.inventory(True),self.inventory(True)]),patch.object(self.a,'healthy'):
            self.a.apply('frontend',candidate())
            next_sha='b'*40;self.a.apply('frontend',candidate(sha=next_sha,tag=f'build-{next_sha}-13-1'))
        current=self.a.state['components']['frontend'];self.assertEqual(current['commit'],'b'*40)
        self.assertEqual(current['previous']['commit'],SHA);self.assertNotIn('previous',current['previous'])

    def test_crash_recovery_does_not_require_downloading_old_image(self):
        self.a.state['pending']={'component':'frontend','tag':TAG,'oldImages':{'frontend':'old/front:good','api':'old/api:good'}}
        with patch.object(agent,'command',return_value=b'') as cmd,patch.object(self.a,'healthy'):
            self.a.recover()
        self.assertNotIn('pending',self.a.state);self.assertIn('--no-build',cmd.call_args.args[0])

    def test_migration_edits_and_unapproved_new_schema_are_blocked(self):
        d=candidate('api');m=d[1];m['migrations']={'initial':'a'*64,'new':'b'*64}
        output=f'initial|{"a"*64}\n'.encode()
        with patch.object(agent,'command',return_value=output):
            with self.assertRaises(agent.PermanentError):self.a.migration_check(m,d[2])
            self.assertEqual(self.a.migration_check(m,{**d[2],'compatibleMigrations':True}),{'new'})
            m['migrations']['initial']='c'*64
            with self.assertRaises(agent.PermanentError):self.a.migration_check(m,{**d[2],'compatibleMigrations':True})

    def test_failed_release_is_not_repeated_every_poll(self):
        self.a.state['failed']={'frontend':TAG}
        with patch.object(self.a,'latest',return_value=candidate()),patch.object(self.a,'stage') as stage:
            self.a.run('poll','frontend');stage.assert_not_called()

    def test_legacy_checksum_exception_only_accepts_exact_installed_baseline(self):
        d=candidate('api');d[1]['migrations']={'legacy':'b'*64}
        self.a.config['legacyMigrationChecksums']={'legacy':{'databaseChecksum':'a'*64,'imageChecksum':'b'*64}}
        with patch.object(agent,'command',return_value=f'legacy|{"a"*64}\n'.encode()):
            self.assertEqual(self.a.migration_check(d[1],d[2]),set())
            d[1]['migrations']['legacy']='c'*64
            with self.assertRaises(agent.PermanentError):self.a.migration_check(d[1],d[2])

    def test_check_and_stage_never_recover_or_restart_containers(self):
        self.a.state['pending']={'component':'frontend'}
        with patch.object(self.a,'recover') as recover:
            with self.assertRaises(agent.DeployError):self.a.run('stage','frontend',TAG)
            recover.assert_not_called()

if __name__=='__main__':unittest.main()
