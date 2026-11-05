const fs = require('node:fs');
const setup = require('../../../src/dictation-setup.cjs');
const core = require('../../../src/core.cjs');
const training = require('../decision-values/dataset.json');
const cases = require('./cases.json');
const endpoint = 'http://127.0.0.1:11434/api/chat';
const settings = { model: 'qwen3.5:9b', ollamaUrl: endpoint };

async function inference(body) {
  const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({...body, think:false, options:{temperature:0, seed:42, num_predict:900}})});
  if (!response.ok) throw Error('Ollama HTTP ' + response.status);
  return response.json();
}
const {composeDraft} = setup({handle() {}, settings, core, companies:new Map([['test',{name:'Тест'}]]),
  companyId:'test', team:{context:()=>''}, text:(value,max)=>{
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Некорректный или слишком длинный текст.');
    return value.trim();
  },
  request:(_url,opt)=>inference(JSON.parse(opt.body))});
const exampleMessages = training.train.flatMap(r=>[
  {role:'user',content:r.target+'\n'+r.note}, {role:'assistant',content:JSON.stringify(r.expected)}
]);
async function run(output) {
  const fd=fs.openSync(output,'wx');
  try {
    let n=0;
    for (const c of cases) for (const state of ['pending','accepted','changed']) {
      const context={id:c.id,at:Date.UTC(2026,0,1),title:c.title,source:'Заметка',text:c.common+' '+c[state]};
      for (const mode of n++ % 2 ? ['guided','direct'] : ['direct','guided']) {
        const start=Date.now();
        let analysis;
        if (mode==='guided') {
          const result=await inference({model:settings.model,stream:false,format:'json',messages:[
            {role:'system',content:training.instruction}, ...exampleMessages,
            {role:'user',content:c.target+'\n'+context.text}
          ]});
          analysis=JSON.parse(result.message.content);
        }
        const input=analysis ? {...context, decisionAnalysis:{target:c.target,...analysis}} : context;
        let draft, error;
        try { draft=await composeDraft('Составь одну задачу Jira по итогам обсуждения.',input); }
        catch (e) { error=e.message; }
        fs.writeSync(fd,JSON.stringify({id:c.id,state,mode,analysis,draft,error,ms:Date.now()-start})+'\n');
      }
    }
  } finally {fs.closeSync(fd);}
}
run(process.argv[2]).catch(err=>{console.error(err);process.exitCode=1;});
