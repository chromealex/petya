const assert=require('node:assert/strict');const {normalize,SIZE}=require('../src/model-context.cjs');
const n=(url,body)=>JSON.parse(normalize(url,JSON.stringify(body)));
assert.equal(n('http://127.0.0.1:11434/api/chat',{model:'q',options:{num_ctx:32768,temperature:0}}).options.num_ctx,SIZE);
assert.equal(n('http://127.0.0.1:11434/api/chat',{model:'q',options:{temperature:0}}).options.temperature,0);
assert.equal(n('http://localhost:11434/api/chat',{model:'q'}).options.num_ctx,SIZE);
assert.equal(n('http://127.0.0.1:11434/api/chat',{model:'q',options:{num_ctx:4096}}).options.num_ctx,4096);
assert.equal(n('https://slack.com/api/chat.postMessage',{model:'q'}).options,undefined);
assert.equal(normalize('http://127.0.0.1:11434/api/tags','x'),'x');
console.log('Model context: one num_ctx for every local model request, low-memory retry kept, other services untouched passed');
