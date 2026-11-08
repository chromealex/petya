const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {CodexClient}=require('./codex-client.cjs');
const {chooseProject}=require('./agent-projects.cjs');
function claudeCall(payload){return new Promise((resolve,reject)=>{
  if(process.platform!=='darwin')return reject(new Error('Автоотправка Claude пока доступна только на macOS. Задача сохранена.'));
  const helper=path.join(__dirname,'../assets/claude-send');
  if(!fs.existsSync(helper))return reject(new Error('Нужна актуальная собранная версия Пети с модулем отправки Claude.'));
  const p=spawn(helper,[],{stdio:['pipe','pipe','pipe']});let output='';let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{p.kill();finish(new Error('Claude не подтвердил отправку. Проверьте чат перед повтором.'));},75000);
  p.on('error',e=>finish(e));p.stdout.on('data',d=>{output+=d;if(output.length>1000000){p.kill();finish(new Error('Слишком большой ответ Claude'));}});p.stderr.on('data',()=>{});
  p.on('exit',()=>{try{const result=JSON.parse(output);finish(result.error?Object.assign(new Error(result.error),{definitelyNotSent:result.attempted===false}):null,result);}catch{finish(new Error('Claude не подтвердил результат передачи.'));}});
  p.stdin.end(JSON.stringify(payload));
});}
function delivery({semantic,onEvent}) {
  const codex=new CodexClient({onEvent});
  let claudeQueue=Promise.resolve();
  const claude=payload=>{const task=claudeQueue.then(()=>claudeCall(payload));claudeQueue=task.catch(()=>{});return task;};
  return {
    // Claude: the helper reads the chat through Accessibility. A background check is skipped while Claude is
    // in front, has an unsent draft or is not running ({status:'skipped'}); nothing is ever sent from here.
    status:async(row,{background=false}={})=>{
      if(row.target==='codex')return codex.status(row);
      if(!row.url)throw new Error('Ссылка на чат Claude пока неизвестна. Откройте его чат.');
      const result=await claude({action:'status',url:row.url,marker:'[Петя: '+row.id+']',background});
      if(result.status==='skipped')return {status:'skipped',reason:result.reason||''};
      if(!['inProgress','completed','needsAttention'].includes(result.status))throw new Error('Claude вернул неизвестный статус.');
      return {status:result.status,answer:typeof result.answer==='string'?result.answer:''};
    },
    projects:async target=>target==='codex'?codex.projects():(await claude({action:'projects'})).projects,
    choose:(row,projects)=>chooseProject(row.command||'',row.contextText||row.prompt,projects,semantic),
    submit:async(row,project,persist)=>{
      if(row.target==='codex')return codex.submit(row,project,persist);
      const marker='[Петя: '+row.id+']';
      return claude({action:'send',project,prompt:row.prompt+'\n\n'+marker,marker});
    }
  };
}
module.exports={delivery};
