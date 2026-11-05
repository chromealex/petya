const assert = require('node:assert/strict');
const {checkSpace,checkModelSpace}=require('../src/disk-space.cjs');
const os=require('node:os'),path=require('node:path');
assert.throws(()=>checkSpace(os.tmpdir(),1024**3,()=>({bavail:1,bsize:4096})),/требуется.*свободно/);
assert(checkSpace(path.join(os.tmpdir(),'missing-petya-path','models'),1,()=>({bavail:1024**3,bsize:4})).available>0);
(async()=>{
 await assert.rejects(checkModelSpace('qwen3:4b',async()=>new Response(JSON.stringify({layers:[{size:1024**5}]}))),/Недостаточно места/);
 await assert.rejects(checkModelSpace('qwen3:4b',async()=>new Response('{}')),/определить/);
 console.log('Disk checks: insufficient space, missing destination, manifest size and unknown size passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
