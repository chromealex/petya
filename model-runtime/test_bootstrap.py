"""Bootstrap lifecycle checks use fake loading and leave no service running."""
import runtime_test_path
import io
import json
import os
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from bootstrap import PipeControl,StartupError,admit_manifest,normalize_config,public_error,run_worker
from artifacts import manifest_digest


class Server:
    def __init__(self,*args):self.server_port=12345;self.end=threading.Event();self.cancelled=False;self.closed=False
    def serve_forever(self):self.end.wait(3)
    def cancel_all(self):self.cancelled=True
    def shutdown(self):self.end.set()
    def server_close(self):self.closed=True


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='petya-bootstrap-');self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name);manifest={'qualification':'development'}
        path=root/'manifest.json';path.write_text(json.dumps(manifest))
        self.config={'manifest':str(path),'base':str(root),'adapter':str(root),'digest':manifest_digest(manifest),'token':'X'*48,'allow_development':True}

    def test_pipe_preserves_prefetched_lines_and_bounds(self):
        read_fd,write_fd=os.pipe()
        try:
            os.write(write_fd,b'config\nstop\n123456789')
            control=PipeControl(read_fd,threading.Event())
            self.assertEqual(control.readline(20),b'config\n')
            self.assertEqual(control.readline(20),b'stop\n')
            self.assertEqual(control.readline(5),b'12345')
            os.close(write_fd);write_fd=None
            self.assertEqual(control.readline(20),b'6789')
            self.assertEqual(control.readline(20),b'')
        finally:
            os.close(read_fd)
            if write_fd is not None:os.close(write_fd)

    def test_pipe_read_observes_stop_without_parent_eof(self):
        read_fd,write_fd=os.pipe();stop=threading.Event();result=[]
        control=PipeControl(read_fd,stop)
        reader=threading.Thread(target=lambda:result.append(control.readline(20)))
        try:
            reader.start();stop.set();reader.join(1)
            self.assertFalse(reader.is_alive());self.assertEqual(result,[b''])
        finally:os.close(write_fd);reader.join(1);os.close(read_fd)

    def test_requires_explicit_development_mode(self):
        config=normalize_config({**self.config,'allow_development':False})
        with self.assertRaises(StartupError):admit_manifest(config)

    def test_bad_configuration_and_pin(self):
        for update in [{'token':'short'},{'port':True},{'manifest':'relative'},{'unknown':True}]:
            with self.subTest(update=update),self.assertRaises(StartupError):normalize_config({**self.config,**update})
        with self.assertRaises(StartupError):admit_manifest({**self.config,'digest':'0'*64})

    def test_eof_before_load_does_not_start_server(self):
        events=[];stop=threading.Event();stop.set()
        def forbidden(*args,**kwargs):self.fail('Loader must not run after cancellation')
        run_worker(self.config,io.BytesIO(b''),events.append,stop,forbidden,Server)
        self.assertEqual(events,[{'phase':'stopped'}])

    def lifecycle(self,command):
        read_fd,write_fd=os.pipe();reader=os.fdopen(read_fd,'rb');writer=os.fdopen(write_fd,'wb',buffering=0)
        events=[];servers=[];ready=threading.Event();errors=[]
        def emit(event):
            events.append(event)
            if event['phase']=='ready':ready.set()
        def load(*args,progress=None):
            progress({'phase':'verifying','verified_bytes':1,'total_bytes':1})
            progress({'phase':'loading'})
            return SimpleNamespace(identity=SimpleNamespace(name='development',digest=self.config['digest'],qualification='development'))
        def factory(*args):server=Server();servers.append(server);return server
        def work():
            try:run_worker(self.config,reader,emit,loader=load,server_factory=factory)
            except Exception as error:errors.append(error)
        thread=threading.Thread(target=work);thread.start()
        try:
            self.assertTrue(ready.wait(2))
            if command is not None:writer.write(command)
            writer.close();thread.join(3)
            self.assertFalse(thread.is_alive());self.assertFalse(errors)
            self.assertTrue(servers[0].cancelled and servers[0].closed)
            self.assertEqual(events[-1],{'phase':'stopped'})
            self.assertNotIn(self.config['token'],json.dumps(events))
        finally:
            if not writer.closed:writer.close()
            thread.join(4);reader.close()

    def test_stop_command(self):self.lifecycle(b'{"command":"stop"}\n')
    def test_parent_eof(self):self.lifecycle(None)
    def test_unknown_control_is_not_executed(self):self.lifecycle(b'{"command":"execute","text":"secret"}\n')

    def test_unexpected_error_does_not_leak_details(self):
        self.assertNotIn(self.config['token'],json.dumps(public_error(RuntimeError(self.config['token']))))


if __name__=='__main__':unittest.main()
