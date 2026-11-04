import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import agent
class IdempotentDeliveryTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.sha='a'*40;self.image='sha256:'+'1'*64;self.tag='build-'+self.sha+'-1-1';self.ref='nawah/api:sha-'+self.sha
  self.manifest={'tag':self.tag,'imageId':self.image,'imageRef':self.ref,'commit':self.sha}
  self.a=agent.Agent.__new__(agent.Agent);self.a.root=self.root;self.a.config={'containers':{'api':'test-api'}};self.a.state={'components':{'api':{'tag':self.tag,'imageId':self.image,'configId':self.image,'imageRef':self.ref}},'failed':{}}
  self.a.event=lambda *args,**kwargs:None
 def test_cached_verified_image_is_not_loaded_twice(self):
  image={'Id':self.image,'Architecture':'amd64','Config':{'Labels':{'org.opencontainers.image.revision':self.sha}}}
  with patch.object(agent,'command',return_value=json.dumps([image]).encode()) as command:
   self.assertEqual(self.a.load('api',(None,self.manifest,None,None),self.root/'unused'),self.image)
   self.assertEqual(len(command.call_args_list),1);self.assertEqual(command.call_args.args[0][1:3],['image','inspect'])
 def test_tampered_cached_image_is_refused(self):
  image={'Id':'wrong','Architecture':'amd64','Config':{'Labels':{'org.opencontainers.image.revision':self.sha}}}
  with patch.object(agent,'command',return_value=json.dumps([image]).encode()):
   with self.assertRaises(agent.PermanentError):self.a.load('api',(None,self.manifest,None,None),self.root/'unused')
 def test_reapplying_current_healthy_release_does_not_backup_or_redeploy(self):
  with patch.object(self.a,'latest',return_value=(None,self.manifest,None,None)),patch.object(self.a,'recover'),patch.object(self.a,'inventory',return_value={'test-api':{'Image':self.image,'Config':{'Image':self.ref}}}),patch.object(self.a,'healthy') as healthy,patch.object(self.a,'stage') as stage,patch.object(self.a,'apply') as apply:
   self.a.run('apply','api');healthy.assert_called_once_with('api');stage.assert_not_called();apply.assert_not_called()
if __name__=='__main__':unittest.main()
