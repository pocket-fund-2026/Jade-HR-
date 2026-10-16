"""Fenced local/Supabase routing with synchronous replication before write success.
No request that may already have committed is replayed on the other database.
"""
from contextvars import ContextVar
from datetime import datetime,timezone
import os,threading,time
import httpx
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

class HAUnavailable(RuntimeError):
    pass

PIN=ContextVar('jade_hr_database_route',default=None)

class Coordinator:
    def __init__(self,primary_url,primary_key,standby_url,standby_key,client=None):
        self.urls={'local':primary_url.rstrip('/'),'supabase':standby_url.rstrip('/')}
        self.keys={'local':primary_key,'supabase':standby_key}
        self.http=client or httpx.Client(timeout=httpx.Timeout(12,connect=3))
        self.lock=threading.RLock()
        self.cached=None
        self.cached_at=0.0

    def rpc(self,backend,name,payload):
        try:
            r=self.http.post(self.urls[backend]+'/rest/v1/rpc/'+name,json=payload,headers={'apikey':self.keys[backend],'Authorization':'Bearer '+self.keys[backend]})
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError,ValueError) as exc:
            raise HAUnavailable('HR database availability check failed') from exc

    def state(self,promote=False):
        return self.rpc('supabase','hr_ha_route',{'p_promote':promote})

    def select(self):
        # Cloud authority is checked outside the Windows failure domain.
        # A two-second process cache only shortens a lease; it never extends it.
        with self.lock:
            now=time.monotonic()
            if self.cached and now-self.cached_at<2:
                return dict(self.cached)
            state=self.state(promote=True)
            route={'backend':state['active'],'epoch':int(state['epoch'])}
            self.cached=route; self.cached_at=now
            return dict(route)

    def flush(self,epoch):
        # Each RPC applies a complete source transaction (or several) atomically.
        # Concurrent flushers are deduplicated by the cloud checkpoint lock.
        state=self.state(promote=False)
        if state['active']!='local' or int(state['epoch'])!=int(epoch):
            raise HAUnavailable('The local database has been fenced')
        after=int(state['last_event'])
        for _ in range(100):
            events=self.rpc('local','hr_ha_pending',{'p_after':after,'p_limit':1000})
            if not events: return after
            result=self.rpc('supabase','hr_ha_apply',{'p_events':events,'p_epoch':int(epoch)})
            after=int(result['last_event'])
        raise HAUnavailable('Database standby is catching up; retry shortly')

    def storage_objects(self,request):
        path=request.url.path.split("/storage/v1/object/",1)[-1]
        from urllib.parse import unquote
        path=unquote(path)
        if request.method=="DELETE":
            import json
            bucket=path.split("/",1)[0]
            body=json.loads(request.read() or b"{}")
            return [bucket+"/"+name for name in body.get("prefixes",[])]
        return [path]

    def authorize_storage(self,request,epoch,backend):
        return self.rpc('supabase','hr_ha_storage_authorize',{'p_epoch':int(epoch),'p_backend':backend,'p_objects':self.storage_objects(request)})

    def mirror_storage(self,request,epoch):
        state=self.state(promote=False)
        if state['active']!='local' or int(state['epoch'])!=int(epoch):
            raise HAUnavailable('The local document store has been fenced')
        self.authorize_storage(request,epoch,'local')
        path=request.url.path
        primary_prefix=httpx.URL(self.urls['local']).path.rstrip('/')
        if primary_prefix and path.startswith(primary_prefix+'/'): path=path[len(primary_prefix):]
        url=self.urls['supabase']+path
        if request.url.query: url+='?'+request.url.query.decode()
        headers={k:v for k,v in request.headers.items() if k.lower() not in {'host','content-length','authorization','apikey'}}
        headers.update(apikey=self.keys['supabase'],Authorization='Bearer '+self.keys['supabase'])
        # Replication retries can safely replace the identical uploaded object.
        if '/storage/v1/object/' in path and request.method in {'POST','PUT'}: headers['x-upsert']='true'
        try:
            r=self.http.request(request.method,url,headers=headers,content=request.read(),timeout=60)
            r.raise_for_status()
        except httpx.HTTPError as exc:
            raise HAUnavailable('Document standby did not acknowledge the write') from exc

class MirrorTransport(httpx.BaseTransport):
    def __init__(self,delegate,coordinator,backend):
        self.delegate=delegate; self.coordinator=coordinator; self.backend=backend

    def handle_request(self,request):
        request.headers['X-JadeHR-HA']='1'
        is_write=request.method not in {'GET','HEAD','OPTIONS'}
        path=request.url.path
        # Storage POST signing/listing endpoints only read metadata.
        storage_write=('/storage/v1/object/' in path or path.endswith('/storage/v1/object')) and not any(part in path for part in ['/object/sign/','/object/list/'])
        database_write='/rest/v1/' in path and '/rpc/hr_ha_' not in path
        must_mirror=self.backend=='local' and is_write and (storage_write or database_write)
        if must_mirror: request.read()
        if self.backend=='supabase' and is_write and storage_write:
            request.read()
            route=PIN.get() or self.coordinator.select()
            self.coordinator.authorize_storage(request,route['epoch'],'supabase')
        response=self.delegate.handle_request(request)
        if must_mirror and 200<=response.status_code<300:
            # Consume before making another request through pooled connections.
            response.read()
            route=PIN.get() or self.coordinator.select()
            epoch=route['epoch']
            try:
                if storage_write: self.coordinator.mirror_storage(request,epoch)
                if database_write: self.coordinator.flush(epoch)
            except Exception:
                response.close()
                # The primary outcome may be committed. Never replay elsewhere.
                raise
        return response

    def close(self): self.delegate.close()

class HAProxy:
    def __init__(self,primary_url,primary_key,standby_url,standby_key,transport_factory):
        self.coordinator=Coordinator(primary_url,primary_key,standby_url,standby_key)
        self.clients={backend:create_client(self.coordinator.urls[backend],self.coordinator.keys[backend],options=SyncClientOptions(httpx_client=httpx.Client(transport=MirrorTransport(transport_factory(),self.coordinator,backend),timeout=httpx.Timeout(20,connect=3)))) for backend in ['local','supabase']}

    def __getattr__(self,name):
        route=PIN.get() or self.coordinator.select()
        return getattr(self.clients[route['backend']],name)

    async def middleware(self,request,call_next):
        from starlette.concurrency import run_in_threadpool
        from starlette.responses import JSONResponse
        token=None
        try:
            route=await run_in_threadpool(self.coordinator.select)
            token=PIN.set(route)
            response=await call_next(request)
            response.headers['X-JadeHR-Backend']=route['backend']
            return response
        except HAUnavailable:
            return JSONResponse({'detail':'HR database standby is switching or catching up. Please retry shortly.'},status_code=503,headers={'Retry-After':'5'})
        finally:
            if token is not None: PIN.reset(token)
