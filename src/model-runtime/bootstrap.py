"""Private-stdin process bootstrap; does not install or select a model."""
import contextlib
import json
import os
import select
from pathlib import Path
import re
import signal
import sys
import threading
from artifacts import ArtifactError, manifest_digest
from contract import RequestError, parse_json


class StartupError(ValueError):pass
class StartupCancelled(Exception):pass


class PipeControl:
    """Read a private pipe without holding a buffered-stdin lock at shutdown."""
    def __init__(self,fd,stop):
        self.fd=fd;self.stop=stop;self.pending=bytearray()

    def readline(self,limit):
        while not self.stop.is_set():
            newline=self.pending.find(b'\n')
            if newline>=0 or len(self.pending)>=limit:
                size=min(newline+1 if newline>=0 else len(self.pending),limit)
                line=bytes(self.pending[:size]);del self.pending[:size];return line
            readable,_,_=select.select([self.fd],[],[],0.1)
            if not readable:continue
            chunk=os.read(self.fd,min(4096,limit-len(self.pending)))
            if not chunk:
                line=bytes(self.pending);self.pending.clear();return line
            self.pending.extend(chunk)
        return b''


def normalize_config(config):
    required={'manifest','base','adapter','digest','token'}
    if type(config) is not dict or not required<=set(config) or set(config)-required-{'port','allow_development'}:
        raise StartupError('Неверная конфигурация запуска сервиса.')
    for field in ['manifest','base','adapter']:
        if type(config[field]) is not str or len(config[field])>4096 or not Path(config[field]).is_absolute():
            raise StartupError('Нужны абсолютные пути к файлам модели.')
    if type(config['digest']) is not str or not re.fullmatch('[a-f0-9]{64}',config['digest']):raise StartupError('Нужен закреплённый хеш модели.')
    if type(config['token']) is not str or not re.fullmatch('[A-Za-z0-9_-]{32,256}',config['token']):raise StartupError('Нужен случайный токен доступа к сервису.')
    port=config.get('port',0);development=config.get('allow_development',False)
    if type(port) is not int or not 0<=port<=65535 or type(development) is not bool:raise StartupError('Неверные параметры запуска сервиса.')
    return {**config,'port':port,'allow_development':development}


def admit_manifest(config):
    manifest=parse_json(Path(config['manifest']).read_bytes())
    if type(manifest) is not dict or manifest_digest(manifest)!=config['digest']:raise StartupError('Манифест выбранной модели не совпадает.')
    stage=manifest.get('qualification')
    if stage not in ('development','release'):raise StartupError('Не указан этап подготовки модели.')
    if stage=='development' and not config['allow_development']:raise StartupError('Модель ещё не подготовлена к выпуску. Для проверки нужен явный режим разработки.')


def public_error(error):
    message=str(error) if isinstance(error,(StartupError,ArtifactError,RequestError)) else 'Не удалось запустить локальный сервис. Проверь среду и файлы модели.'
    return {'phase':'error','code':type(error).__name__,'message':message}


def run_worker(config,control,emit,stop=None,loader=None,server_factory=None):
    config=normalize_config(config);admit_manifest(config)
    stop=stop if stop is not None else threading.Event()
    server=None;serving=None;failures=[]
    def monitor():
        try:
            while not stop.is_set():
                line=control.readline(65537)
                if not line:
                    stop.set();return
                if len(line)>65536:
                    stop.set();return
                try:command=parse_json(line)
                except RequestError:
                    emit({'phase':'control-error','message':'Некорректная команда управления.'});continue
                if command=={'command':'stop'}:
                    stop.set();return
                emit({'phase':'control-error','message':'Поддерживается только команда stop.'})
        except (OSError,ValueError):stop.set()
    def progress(event):
        if stop.is_set():raise StartupCancelled()
        emit(event)
    monitor_thread=threading.Thread(target=monitor,daemon=True,name='petya-parent-control')
    monitor_thread.start()
    try:
        if stop.is_set():raise StartupCancelled()
        emit({'phase':'starting'})
        if loader is None:
            from engine import load_engine
            loader=load_engine
        with contextlib.redirect_stdout(sys.stderr):
            engine=loader(config['manifest'],config['base'],config['adapter'],config['digest'],progress=progress)
        if stop.is_set():raise StartupCancelled()
        if server_factory is None:
            from transport import RuntimeServer
            server_factory=RuntimeServer
        server=server_factory(engine,config['token'],config['port'])
        def serve():
            try:server.serve_forever()
            except Exception as error:failures.append(error)
            finally:
                if not stop.is_set() and not failures:failures.append(StartupError('Сервис неожиданно остановился.'))
                stop.set()
        serving=threading.Thread(target=serve,daemon=True,name='petya-http')
        serving.start()
        if not stop.is_set():
            emit({'phase':'ready','host':'127.0.0.1','port':server.server_port,'model':engine.identity.name,
                  'digest':engine.identity.digest,'qualification':engine.identity.qualification})
        stop.wait()
        if failures:raise failures[0]
    except StartupCancelled:
        pass
    finally:
        if server is not None:
            server.cancel_all();server.shutdown();server.server_close()
        if serving is not None:serving.join(5)
        stop.set()
        monitor_thread.join(0.5)
        emit({'phase':'stopped'})


def main():
    output=sys.stdout;lock=threading.Lock();stop=threading.Event()
    def emit(event):
        with lock:
            try:output.write(json.dumps(event,ensure_ascii=False)+'\n');output.flush()
            except (BrokenPipeError,OSError):stop.set()
    signal.signal(signal.SIGTERM,lambda *_:stop.set())
    signal.signal(signal.SIGINT,lambda *_:stop.set())
    try:
        control=PipeControl(sys.stdin.fileno(),stop)
        line=control.readline(65537)
        if not line or len(line)>65536:raise StartupError('Не получена конфигурация запуска.')
        run_worker(parse_json(line),control,emit,stop)
        return 0
    except Exception as error:
        emit(public_error(error));return 1


if __name__=='__main__':sys.exit(main())
