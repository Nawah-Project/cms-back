import copy, importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('agent',pathlib.Path(__file__).with_name('agent.py'))
agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
class MountIdentity(unittest.TestCase):
 def setUp(self):
  self.mounts=[{'Type':'volume','Name':'cv-private','Source':'/engine/cv','Destination':'/app/private-storage/cvs','Mode':'rw','RW':True,'Propagation':''},{'Type':'bind','Source':'/private/learning','Destination':'/app/private-storage/learning','Mode':'rw','RW':True,'Propagation':'rprivate'},{'Type':'bind','Source':'/private/inbox','Destination':'/app/private-storage/learning-inbox','Mode':'rw','RW':True,'Propagation':'rprivate'}]
 def test_recreation_order_does_not_change_storage(self):
  self.assertTrue(agent.mounts_equal(self.mounts,self.mounts[::-1]))
 def test_every_storage_field_still_matters(self):
  for key,value in [('Type','volume'),('Source','/another-owner'),('Destination','/public'),('Mode','ro'),('RW',False),('Propagation','shared')]:
   changed=copy.deepcopy(self.mounts);changed[1][key]=value
   with self.subTest(field=key):self.assertFalse(agent.mounts_equal(self.mounts,changed))
  self.assertFalse(agent.mounts_equal(self.mounts,self.mounts[:-1]))
  changed=copy.deepcopy(self.mounts);changed[0]['Name']='different-volume';self.assertFalse(agent.mounts_equal(self.mounts,changed))
if __name__=='__main__':unittest.main()
