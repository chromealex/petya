"""Real worker process lifecycle with fake model loading and real HTTP transport."""
import runtime_test_path
import http.client
import json
import os
from pathlib import Path
import queue
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from artifacts import manifest_digest

WORKER = r'''
import runtime_test_path
import bootstrap, engine
from types import SimpleNamespace
from test_engine import Backend

def load(manifest, base, adapter, digest, progress):
    print('fake loader diagnostic')
    progress({'phase':'loading'})
    identity=SimpleNamespace(name='process-test',digest=digest,size=123,qualification='development')
    return engine.GenerationEngine(identity,Backend())
engine.load_engine=load
raise SystemExit(bootstrap.main())
'''


class ProcessTests(unittest.TestCase):
    def lifecycle(self,how):
        with tempfile.TemporaryDirectory(prefix='petya-process-') as directory:
            manifest={'qualification':'development'};path=Path(directory)/'manifest.json'
            path.write_text(json.dumps(manifest));token='P'*48
            config={'manifest':str(path),'base':directory,'adapter':directory,
                    'digest':manifest_digest(manifest),'token':token,'allow_development':True}
            worker=subprocess.Popen([sys.executable,'-c',WORKER],cwd=Path(__file__).resolve().parent,
                                    stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            events=queue.Queue();captured=[]
            def read():
                for line in worker.stdout:
                    captured.append(line);events.put(json.loads(line))
            reader=threading.Thread(target=read,daemon=True);reader.start()
            try:
                worker.stdin.write(json.dumps(config)+'\n');worker.stdin.flush()
                ready=None
                for _ in range(10):
                    event=events.get(timeout=10)
                    if event['phase']=='ready':ready=event;break
                self.assertIsNotNone(ready)
                connection=http.client.HTTPConnection('127.0.0.1',ready['port'],timeout=3)
                connection.request('GET','/api/tags',headers={'Authorization':'Bearer '+token})
                response=connection.getresponse();self.assertEqual(response.status,200)
                self.assertEqual(json.loads(response.read())['models'][0]['digest'],config['digest']);connection.close()
                if how=='eof':worker.stdin.close()
                elif how=='stop':worker.stdin.write('{"command":"stop"}\n');worker.stdin.flush()
                else:worker.send_signal(signal.SIGTERM)
                # Keep stdin open for stop/signal: closing it here would hide a blocked-reader exit bug.
                status=worker.wait(timeout=10);reader.join(2)
                errors=worker.stderr.read()
                self.assertEqual(status,0,errors)
                self.assertEqual(json.loads(captured[-1]),{'phase':'stopped'})
                self.assertNotIn(token,''.join(captured)+errors)
                self.assertIn('fake loader diagnostic',errors)
                self.assertNotIn('fake loader diagnostic',''.join(captured))
            finally:
                if worker.poll() is None:worker.kill();worker.wait(timeout=5)
                if not worker.stdin.closed:worker.stdin.close()
                reader.join(2);worker.stdout.close();worker.stderr.close()

    def test_parent_eof(self):self.lifecycle('eof')
    def test_stop_control(self):self.lifecycle('stop')
    def test_termination_signal(self):self.lifecycle('signal')


if __name__=='__main__':unittest.main()
