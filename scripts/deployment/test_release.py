import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import release

SHA='a'*40
TAG=f'build-{SHA}-123-1'

class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.environment=patch.dict(os.environ,{'GITHUB_REPOSITORY':'Nawah-Project/cms-front','GITHUB_ACTOR':'authorized-owner'})
        self.environment.start();self.addCleanup(self.environment.stop)
        self.args=SimpleNamespace(tag=TAG,directory=self.tmp.name,compatible_migrations=False)
        self.candidate={'id':7,'draft':False,'prerelease':True,'assets':[]}
        self.manifest={'schema':1,'repository':'Nawah-Project/cms-front','component':'frontend','tag':TAG,'commit':SHA,'runId':123,'runAttempt':1,'archiveSha256':'b'*64,'migrations':{}}
        self.run={'head_sha':SHA,'head_branch':'main','event':'push','path':'.github/workflows/ci_cd.yaml','status':'completed','conclusion':'success'}
        self.calls=[]
    def api(self,repo,path,method='GET',data=None,**kw):
        self.calls.append((path,method,data))
        if path.startswith('/releases/tags/'):return self.candidate
        if path.startswith('/actions/runs/'):return self.run
        if path=='/releases/latest':return None
        return {}
    def test_approve_promotes_same_candidate_without_building(self):
        with patch.object(release,'api',side_effect=self.api),patch.object(release,'asset_json',return_value=self.manifest),patch.object(release,'upload') as upload,patch.object(release.subprocess,'check_output') as build:
            release.approve(self.args);build.assert_not_called();upload.assert_called_once()
        body=json.loads((Path(self.tmp.name)/'approval.json').read_text());self.assertEqual(body['archiveSha256'],'b'*64)
        self.assertTrue(any(method=='PATCH' and data['make_latest']=='true' and data['prerelease'] is False for _,method,data in self.calls))
    def test_failed_or_other_branch_build_cannot_be_approved(self):
        for update in [{'conclusion':'failure'},{'head_branch':'dev'},{'head_sha':'c'*40},{'event':'pull_request'},{'path':'.github/workflows/other.yaml'}]:
            with self.subTest(update=update):
                saved=dict(self.run);self.run.update(update)
                with patch.object(release,'api',side_effect=self.api),patch.object(release,'asset_json',return_value=self.manifest),patch.object(release,'upload') as upload:
                    with self.assertRaises(AssertionError):release.approve(self.args)
                    upload.assert_not_called()
                self.run=saved
    def test_arbitrary_tag_injection_is_rejected(self):
        self.args.tag='main; touch /tmp/not-allowed'
        with patch.object(release,'api') as api:
            with self.assertRaises(ValueError):release.approve(self.args)
            api.assert_not_called()
    def test_api_schema_change_requires_explicit_compatibility_acknowledgment(self):
        os.environ['GITHUB_REPOSITORY']='Nawah-Project/cms-back'
        self.manifest.update(repository='Nawah-Project/cms-back',component='api',migrations={'new':'c'*64})
        with patch.object(release,'api',side_effect=self.api),patch.object(release,'asset_json',return_value=self.manifest),patch.object(release,'upload') as upload:
            with self.assertRaises(ValueError):release.approve(self.args)
            upload.assert_not_called()
if __name__=='__main__':unittest.main()
