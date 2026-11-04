// A fresh clone has no src/integration-clients.json (secrets are not in git): the app must still start.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {load,EMPTY}=require('../src/integration-clients.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-clients-'));
try{
 assert.deepEqual(load(dir),EMPTY,'missing file means no built-in clients');
 fs.writeFileSync(path.join(dir,'integration-clients.json'),JSON.stringify({google:{client_id:'x'}}));assert.deepEqual(load(dir),{...EMPTY,google:{client_id:'x'}});
 fs.writeFileSync(path.join(dir,'integration-clients.json'),'{broken');assert.throws(()=>load(dir),/повреждён/);
 fs.writeFileSync(path.join(dir,'integration-clients.json'),'[]');assert.throws(()=>load(dir),/объект/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../src/integration-clients.example.json'),'utf8')),EMPTY,'example lists every provider');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Integration clients: missing, valid, broken and non-object files, example passed');
