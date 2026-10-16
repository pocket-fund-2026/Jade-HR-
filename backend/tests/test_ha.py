import sys,unittest,json
from pathlib import Path
import httpx
from ha import Coordinator,MirrorTransport,HAUnavailable,PIN

class TransportTests(unittest.TestCase):
 def coordinator(self,handler): return Coordinator('https://primary.test/hr','primary-key','https://cloud.test','cloud-key',httpx.Client(transport=httpx.MockTransport(handler)))
 def test_write_ack_waits_for_cloud_and_does_not_replay_on_failure(self):
  calls=[]; primary=[]
  def handler(r):
   calls.append(r.url.path)
   if r.url.path.endswith('hr_ha_route'): return httpx.Response(200,json={'active':'local','epoch':1,'last_event':0})
   if r.url.path.endswith('hr_ha_pending'): return httpx.Response(200,json=[{'id':1}])
   if r.url.path.endswith('hr_ha_apply'): return httpx.Response(503,json={'error':'standby down'})
   raise AssertionError('Unexpected fallback write')
  c=self.coordinator(handler); t=MirrorTransport(httpx.MockTransport(lambda r:(primary.append(r.url.path) or httpx.Response(201,json={'id':1}))),c,'local')
  token=PIN.set({'backend':'local','epoch':1})
  try:
   with self.assertRaises(HAUnavailable): t.handle_request(httpx.Request('POST','https://primary.test/hr/rest/v1/hr_employees',json={'id':1}))
  finally: PIN.reset(token)
  self.assertEqual(primary,['/hr/rest/v1/hr_employees']); self.assertTrue(calls[-1].endswith('hr_ha_apply'))
 def test_storage_is_fenced_and_mirrored_with_cloud_credentials(self):
  uploaded=[]; auth=[]
  def handler(r):
   if r.url.path.endswith('hr_ha_route'): return httpx.Response(200,json={'active':'local','epoch':1,'last_event':0})
   if r.url.path.endswith('hr_ha_storage_authorize'): auth.append(json.loads(r.content)); return httpx.Response(200,json={'authorized':True})
   uploaded.append((r.url.path,r.content,r.headers['apikey'],r.headers['authorization'],r.headers['x-upsert'])); return httpx.Response(200,json={})
  c=self.coordinator(handler); t=MirrorTransport(httpx.MockTransport(lambda r:httpx.Response(200,json={})),c,'local'); token=PIN.set({'backend':'local','epoch':1})
  try: t.handle_request(httpx.Request('POST','https://primary.test/hr/storage/v1/object/docs/file.pdf',content=b'original bytes',headers={'apikey':'primary-key','authorization':'Bearer primary-key'}))
  finally: PIN.reset(token)
  self.assertEqual(uploaded,[('/storage/v1/object/docs/file.pdf',b'original bytes','cloud-key','Bearer cloud-key','true')]); self.assertEqual(auth[0]['p_objects'],['docs/file.pdf'])
 def test_stale_cloud_document_writer_cannot_mutate(self):
  primary=[]
  c=self.coordinator(lambda r:httpx.Response(409,json={'error':'fenced'})); t=MirrorTransport(httpx.MockTransport(lambda r:(primary.append(r) or httpx.Response(200))),c,'supabase'); token=PIN.set({'backend':'supabase','epoch':2})
  try:
   with self.assertRaises(HAUnavailable): t.handle_request(httpx.Request('DELETE','https://cloud.test/storage/v1/object/docs',json={'prefixes':['file.pdf']}))
  finally: PIN.reset(token)
  self.assertEqual(primary,[])
 def test_route_uses_cloud_epoch_and_fails_closed_without_authority(self):
  c=self.coordinator(lambda r:httpx.Response(200,json={'active':'supabase','epoch':2})); self.assertEqual(c.select(),{'backend':'supabase','epoch':2})
  c=self.coordinator(lambda r:httpx.Response(503))
  with self.assertRaises(HAUnavailable): c.select()
 def test_metadata_only_storage_post_is_not_mirrored(self):
  c=self.coordinator(lambda r:(_ for _ in ()).throw(AssertionError('Metadata request was mirrored'))); t=MirrorTransport(httpx.MockTransport(lambda r:httpx.Response(200,json={'signedURL':'/object/sign/path'})),c,'local')
  self.assertEqual(t.handle_request(httpx.Request('POST','https://primary.test/hr/storage/v1/object/sign/docs/file.pdf',json={'expiresIn':60})).status_code,200)
if __name__=='__main__': unittest.main(verbosity=2)
