"""Real loopback HTTP tests with fake inference and no GPU use."""
import runtime_test_path
import http.client
import json
import threading
import time
from types import SimpleNamespace
import unittest
from transport import RuntimeServer
from engine import GenerationEngine, GenerationCancelled
from test_engine import Backend


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.token='T'*48
        self.backend=Backend()
        identity=SimpleNamespace(name='petya-development',digest='a'*64,size=123,qualification='development')
        self.engine=GenerationEngine(identity,self.backend)
        self.server=RuntimeServer(self.engine,self.token)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.close)

    def close(self):self.server.shutdown();self.server.server_close();self.thread.join(2)

    def request(self,method,path,body=None,headers=None):
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        data=None if body is None else json.dumps(body).encode()
        h={'Authorization':'Bearer '+self.token,'Content-Type':'application/json',**(headers or {})}
        connection.request(method,path,body=data,headers=h)
        response=connection.getresponse();status=response.status;raw=response.read();connection.close()
        return status,raw

    def body(self,stream=False):return {'model':'petya-development','messages':[{'role':'user','content':'Привет'}],'stream':stream,'format':'json'}

    def test_auth_and_browser_origin(self):
        self.assertEqual(self.request('GET','/api/tags',headers={'Authorization':'Bearer bad'})[0],401)
        self.assertEqual(self.request('GET','/api/tags',headers={'Origin':'https://example.com'})[0],403)
        self.assertEqual(self.backend.calls,[])

    def test_model_identity_and_show(self):
        status,raw=self.request('GET','/api/tags');self.assertEqual(status,200)
        self.assertEqual(json.loads(raw)['models'][0]['digest'],'a'*64)
        self.assertEqual(self.request('POST','/api/show',{'model':'petya-development'})[0],200)
        self.assertEqual(self.request('POST','/api/show',{'model':'other'})[0],404)

    def test_complete_and_stream(self):
        status,raw=self.request('POST','/api/chat',self.body());self.assertEqual(status,200);self.assertTrue(json.loads(raw)['done'])
        status,raw=self.request('POST','/api/chat',self.body(True));self.assertEqual(status,200)
        chunks=[json.loads(line) for line in raw.splitlines()]
        self.assertEqual(sum(bool(c.get('done')) for c in chunks),1)
        self.assertEqual(''.join(c['message']['content'] for c in chunks),'{'+'"answer":"Привет"}')

    def test_invalid_request_and_stream_failure(self):
        body=self.body();body['options']={'temperature':-1}
        self.assertEqual(self.request('POST','/api/chat',body)[0],400)
        self.backend.pieces=['{"answer":']
        status,raw=self.request('POST','/api/chat',self.body(True));self.assertEqual(status,200)
        chunks=[json.loads(line) for line in raw.splitlines()]
        self.assertIn('error',chunks[-1]);self.assertFalse(any(c.get('done') for c in chunks))
        self.assertFalse(self.server.active)

    def test_cancel_and_duplicate_request_id(self):
        entered=threading.Event();original=self.engine.complete
        def waiting(body,cancel):
            entered.set();cancel.wait(4)
            if cancel.is_set():raise GenerationCancelled('Генерация отменена.')
            return original(body,cancel)
        self.engine.complete=waiting;result=[]
        t=threading.Thread(target=lambda:result.append(self.request('POST','/api/chat',self.body(),{'X-Petya-Request-Id':'same-id'})))
        t.start();self.assertTrue(entered.wait(2))
        self.assertEqual(self.request('POST','/api/chat',self.body(),{'X-Petya-Request-Id':'same-id'})[0],409)
        status,raw=self.request('POST','/api/cancel',{'request_id':'same-id'});self.assertEqual(status,200);self.assertTrue(json.loads(raw)['cancelled'])
        t.join(3);self.assertFalse(t.is_alive());self.assertEqual(result[0][0],409)
        self.assertFalse(self.server.active)

    def test_disconnect_releases_generation(self):
        proceed=threading.Event();closed=threading.Event()
        def tokens(prompt,settings,grammar,seed):
            try:
                yield SimpleNamespace(text='start',finish_reason=None,prompt_tokens=3,generation_tokens=1)
                proceed.wait(2)
                for i in range(100):
                    yield SimpleNamespace(text='x'*65536,finish_reason='stop' if i==99 else None,prompt_tokens=3,generation_tokens=i+2)
            finally:closed.set()
        self.backend.generate=tokens
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        connection.request('POST','/api/chat',json.dumps(self.body(True)),{'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
        response=connection.getresponse();self.assertEqual(response.status,200);response.readline()
        response.close();connection.close();proceed.set()
        self.assertTrue(closed.wait(3))
        deadline=time.monotonic()+1
        while self.server.active and time.monotonic()<deadline:time.sleep(0.01)
        self.assertFalse(self.server.active);self.assertFalse(self.engine.lock.locked())

    def test_connection_limit_is_bounded(self):
        acquired=[]
        try:
            while self.server.connections.acquire(blocking=False):acquired.append(True)
            self.assertEqual(len(acquired),16)
            connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=2)
            with self.assertRaises((http.client.RemoteDisconnected,ConnectionResetError,BrokenPipeError)):
                connection.request('GET','/health');connection.getresponse()
            connection.close()
        finally:
            for _ in acquired:self.server.connections.release()

    def test_unknown_route_and_oversize_body(self):
        self.assertEqual(self.request('GET','/api/pull')[0],404)
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        connection.putrequest('POST','/api/chat')
        connection.putheader('Authorization','Bearer '+self.token)
        connection.putheader('Content-Type','application/json')
        connection.putheader('Content-Length',str(1024*1024+1))
        connection.endheaders()
        response=connection.getresponse();self.assertEqual(response.status,413);response.read();connection.close()
        self.assertEqual(self.backend.calls,[])


if __name__=='__main__':unittest.main()
