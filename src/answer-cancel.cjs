const {AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();
const stopped=()=>Object.assign(new Error('Ответ остановлен.'),{name:'AbortError'});
function check(){scope.getStore()?.throwIfAborted();}
module.exports={run:(signal,work)=>scope.run(signal,work),signal:()=>scope.getStore(),check,stopped};
