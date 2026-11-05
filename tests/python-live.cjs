const assert=require('node:assert/strict');
const {PythonRuntime}=require('../src/extensions/python/runtime.cjs');
(async()=>{
 const runtime=new PythonRuntime();const status=await runtime.status();assert.ok(status.ready,JSON.stringify(status));
 let result=await runtime.run({code:'import csv,io,json\nrows=list(csv.DictReader(io.StringIO(files["cost.csv"])))\nprint(sum(int(r["amount"]) for r in rows))',files:{'cost.csv':'name,amount\na,10\nb,25\n'}});
 assert.equal(result.stdout.trim(),'35');assert.equal(result.ok,true);
 result=await runtime.run({code:'print(1/0)'});assert.equal(result.ok,false);assert.match(result.stderr,/ZeroDivisionError/);
 result=await runtime.run({code:`import os,socket,json
checks={}
checks['uid']=os.getuid()
checks['host']=os.path.exists('/Users/aleksandrfeer/Projects/Peter/README.md')
checks['secret']='PETYA_TEST_SECRET' in os.environ
try:
 open('/etc/petya-test','w').write('test')
 checks['write']=True
except OSError:
 checks['write']=False
try:
 s=socket.create_connection(('1.1.1.1',443),timeout=1)
 checks['network']=True
except OSError:
 checks['network']=False
print(json.dumps(checks))`});
 assert.deepEqual(JSON.parse(result.stdout),{uid:65534,host:false,secret:false,write:false,network:false});
 result=await runtime.run({code:'x=bytearray(512*1024*1024)\nprint("unexpected")'});assert.equal(result.ok,false);assert.doesNotMatch(result.stdout,/unexpected/);
 await assert.rejects(runtime.run({code:'print("x"*100000)'}),/64 КиБ/);
 const controller=new AbortController();const run=runtime.run({code:'import time\ntime.sleep(60)'},{signal:controller.signal});setTimeout(()=>controller.abort(),1200);await assert.rejects(run,/остановлено|abort/i);
 await assert.rejects(runtime.run({code:'while True: pass'}),/15 секунд/);
 const remaining=await runtime.cli(['ps','-a','--filter','label=com.petya.python=true','--format','{{.Names}}']);assert.equal(remaining.stdout.trim(),'');
 console.log('Python live: CSV, errors, no host/network/credentials, read-only root, memory/output/time limits, cancellation and cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
