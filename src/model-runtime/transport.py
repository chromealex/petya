"""Authenticated loopback transport; not yet wired into application lifecycle."""
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import itertools
import json
import re
import socket
import threading
import uuid
from contract import RequestError, parse_json
from engine import GenerationError, GenerationBusy, GenerationCancelled


class HTTPProblem(Exception):
    def __init__(self,status,message):self.status,self.message=status,message


class RuntimeServer(ThreadingHTTPServer):
    daemon_threads=True
    allow_reuse_address=False
    def __init__(self,engine,token,port=0):
        if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',token):
            raise ValueError('A random runtime token of at least 32 URL-safe characters is required')
        self.engine=engine;self.authorization=('Bearer '+token).encode()
        self.active={};self.active_lock=threading.Lock()
        self.connections=threading.BoundedSemaphore(16)
        super().__init__(('127.0.0.1',port),Handler)

    def process_request(self,request,client_address):
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:super().process_request(request,client_address)
        except BaseException:
            self.connections.release()
            raise

    def process_request_thread(self,request,client_address):
        try:super().process_request_thread(request,client_address)
        finally:self.connections.release()

    def register(self,request_id,cancel):
        with self.active_lock:
            if request_id in self.active:raise HTTPProblem(409,'Запрос с таким идентификатором уже выполняется.')
            if len(self.active)>=4:raise HTTPProblem(503,'Очередь запросов заполнена.')
            self.active[request_id]=cancel

    def unregister(self,request_id):
        with self.active_lock:self.active.pop(request_id,None)

    def cancel(self,request_id):
        with self.active_lock:
            event=self.active.get(request_id)
            if event:event.set()
            return event is not None

    def cancel_all(self):
        with self.active_lock:
            for event in self.active.values():event.set()

    def server_close(self):
        self.cancel_all()
        super().server_close()


class Handler(BaseHTTPRequestHandler):
    server_version='PetyaRuntime/0.1'
    sys_version=''
    protocol_version='HTTP/1.0'
    def setup(self):
        super().setup();self.connection.settimeout(30)

    def log_message(self,*args):
        pass

    def authenticate(self):
        if self.headers.get('Origin') is not None:raise HTTPProblem(403,'Прямые запросы из браузера не поддерживаются.')
        headers=self.headers.get_all('Authorization',[])
        if len(headers)!=1 or not hmac.compare_digest(headers[0].encode(),self.server.authorization):
            raise HTTPProblem(401,'Требуется доступ к локальному сервису.')

    def body(self):
        if self.headers.get('Content-Encoding','identity')!='identity':raise HTTPProblem(400,'Сжатое тело запроса не поддерживается.')
        if self.headers.get('Transfer-Encoding'):raise HTTPProblem(400,'Потоковое тело запроса не поддерживается.')
        lengths=self.headers.get_all('Content-Length',[])
        if len(lengths)!=1 or not re.fullmatch(r'[0-9]+',lengths[0]):raise HTTPProblem(400,'Неверная длина запроса.')
        size=int(lengths[0])
        if not 0<size<=1024*1024:raise HTTPProblem(413,'Запрос слишком большой или пустой.')
        if self.headers.get('Content-Type','').split(';')[0].strip().lower()!='application/json':raise HTTPProblem(415,'Требуется application/json.')
        data=self.rfile.read(size)
        if len(data)!=size:raise HTTPProblem(400,'Тело запроса передано не полностью.')
        return parse_json(data)

    def send_json(self,status,value,request_id=None):
        data=(json.dumps(value,ensure_ascii=False,allow_nan=False)+'\n').encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        if request_id:self.send_header('X-Petya-Request-Id',request_id)
        self.end_headers();self.wfile.write(data);self.wfile.flush()

    def model_entry(self):
        identity=self.server.engine.identity
        return {'name':identity.name,'model':identity.name,'digest':identity.digest,'size':identity.size,'details':{'format':'mlx-lora'},'qualification':identity.qualification}

    def do_GET(self):self.dispatch('GET')
    def do_POST(self):self.dispatch('POST')

    def dispatch(self,method):
        self.stream_started=False
        try:
            self.authenticate()
            if method=='GET' and self.path=='/api/tags':return self.send_json(200,{'models':[self.model_entry()]})
            if method=='GET' and self.path=='/health':return self.send_json(200,{'status':'ready','model':self.model_entry()})
            if method=='POST' and self.path=='/api/chat':return self.chat(self.body())
            if method=='POST' and self.path=='/api/show':
                body=self.body()
                if type(body) is not dict or set(body)!={'model'} or body['model']!=self.server.engine.identity.name:raise HTTPProblem(404,'Модель не найдена.')
                return self.send_json(200,{'capabilities':['completion'],'details':{'format':'mlx-lora'},'model_info':{},'parameters':'num_ctx 16384','qualification':self.server.engine.identity.qualification})
            if method=='POST' and self.path=='/api/cancel':
                body=self.body()
                if type(body) is not dict or set(body)!={'request_id'} or not isinstance(body['request_id'],str):raise HTTPProblem(400,'Нужен идентификатор запроса.')
                return self.send_json(200,{'cancelled':self.server.cancel(body['request_id'])})
            raise HTTPProblem(404,'Маршрут не найден.')
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as error:
            if isinstance(error,HTTPProblem):status,message=error.status,error.message
            elif isinstance(error,RequestError):status,message=400,str(error)
            elif isinstance(error,GenerationBusy):status,message=503,str(error)
            elif isinstance(error,GenerationCancelled):status,message=409,str(error)
            elif isinstance(error,GenerationError):status,message=502,str(error)
            elif isinstance(error,(TimeoutError,socket.timeout)):status,message=408,'Истекло время запроса.'
            else:status,message=500,'Внутренняя ошибка локального сервиса.'
            try:
                if self.stream_started:
                    self.wfile.write((json.dumps({'error':message},ensure_ascii=False)+'\n').encode());self.wfile.flush()
                else:self.send_json(status,{'error':message})
            except (OSError,ValueError):pass

    def chat(self,body):
        request_id=self.headers.get('X-Petya-Request-Id') or str(uuid.uuid4())
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',request_id):raise HTTPProblem(400,'Неверный идентификатор запроса.')
        cancel=threading.Event();self.server.register(request_id,cancel)
        iterator=None
        try:
            if type(body) is dict and body.get('stream',True) is False:
                result=self.server.engine.complete(body,cancel)
                return self.send_json(200,result,request_id)
            iterator=self.server.engine.stream(body,cancel)
            first=next(iterator)
            self.send_response(200);self.send_header('Content-Type','application/x-ndjson; charset=utf-8')
            self.send_header('Cache-Control','no-store');self.send_header('X-Petya-Request-Id',request_id);self.end_headers()
            self.stream_started=True
            for chunk in itertools.chain([first],iterator):
                self.wfile.write((json.dumps(chunk,ensure_ascii=False,allow_nan=False)+'\n').encode());self.wfile.flush()
        finally:
            cancel.set()
            try:
                if iterator is not None:iterator.close()
            finally:self.server.unregister(request_id)
