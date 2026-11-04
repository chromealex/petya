const {randomUUID,createHash}=require('node:crypto');
const {adf}=require('./core.cjs');
const {adfText}=require('./history.cjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const norm=x=>String(x||'').normalize('NFKC').toLocaleLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const taskHash=t=>hash([t.summary.trim(),t.description.trim()]);
const q=x=>'"'+String(x).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function terms(value){return [...new Set(norm(value).split(' ').filter(w=>w.length>2&&!/^(для|при|что|как|или|это|the|and|with|task|задача|задачи|нужно|надо|работа|работы)$/.test(w)).map(w=>{
 if(/^(авториза|аутентифика|логин|вход|login|signin)/.test(w))return 'авторизация';
 if(/^(исправ|почин|устран|fix|repair)/.test(w))return 'исправление';
 if(/^(ошиб|сбой|bug|error|failure)/.test(w))return 'ошибка';
 if(/^(отчет|репорт|report)/.test(w))return 'отчет';
 if(/^(выгруз|экспорт|export)/.test(w))return 'экспорт';
 if(/^(падени|краш|crash)/.test(w))return 'падение';
 if(/^(уведомлен|нотифика|notification)/.test(w))return 'уведомления';
 return w.length>5?w.replace(/(?:иями|ами|ями|ого|ему|ому|ение|ения|ией|ий|ая|ые|ое|ов|ам|ах|ях|ы|а|у|е)$/u,''):w;
 }))];}
function similarity(task,issue){const left=terms(task.summary),right=terms(issue.summary),common=left.filter(t=>right.includes(t));const exact=norm(task.summary)===norm(issue.summary);const score=exact?1:common.length/Math.max(1,Math.max(left.length,right.length));if(!exact&&(common.length<2||score<0.5))return null;return {...issue,score,reason:exact?'Совпадает название. Это ещё не доказывает, что объём работы одинаковый.':'Общие темы в названиях: '+common.join(', ')+'. Сходство требует проверки.'};}
function issueData(raw,project){if(!raw||typeof raw.key!=='string'||!raw.key.startsWith(project+'-')||!/^\d+$/.test(raw.key.slice(project.length+1))||raw.fields?.project?.key!==project||typeof raw.fields.summary!=='string'||typeof raw.fields.updated!=='string')throw Error('Jira вернула неполную карточку или другой проект. Проверка дублей не завершена.');return {key:raw.key,summary:raw.fields.summary,description:adfText(raw.fields.description).slice(0,5000),status:raw.fields.status?.name||'не получен',updated:raw.fields.updated};}
class TaskDuplicates{
 constructor({workspace,state,save,context,now=Date.now}){Object.assign(this,{workspace,state,save,context,now});this.plans=new Map();this.pending=null;this.busy=false;this.submissions=new Map();this.epoch=0;this.revoked=new Set();state.taskDuplicateOps ||= [];for(const row of state.taskDuplicateOps)if(row.status==='sending')row.status='unknown';}
 reset(){for(const id of this.plans.keys())this.revoked.add(id);this.plans.clear();this.pending=null;this.submissions.clear();this.epoch++;}
 scope(s){const live=this.workspace.settings();return hash([live.jiraUrl,live.jiraProjects,live.jiraProject,live.jiraToken,live.jiraEmail,live.atlassianCredential,live.module_jira,s.jiraProject,this.context()]);}
 check(s,scope){const live=this.workspace.settings();if(live.module_jira==='false'||live.jiraUrl!==s.jiraUrl||!require('./jira-routing.cjs').allowed(live).includes(s.jiraProject)||this.scope(s)!==scope)throw Error('Проект, диалог или подключение изменились. Проверьте план заново.');}
 async scan(tasks,s,scope){this.check(s,scope);const issues=new Map(),seen=new Set();let token;
  for(let page=0;page<100;page++){
   const data=await this.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:'project = '+q(s.jiraProject)+' ORDER BY key ASC',fields:['summary','description','status','updated','project'],maxResults:100,...token?{nextPageToken:token}:{}})},s);this.check(s,scope);
   if(!Array.isArray(data?.issues)||data.isLast!==undefined&&typeof data.isLast!=='boolean'||data.nextPageToken!==undefined&&typeof data.nextPageToken!=='string')throw Error('Jira вернула неполную страницу. Проверка дублей не завершена.');
   for(const raw of data.issues){const row=issueData(raw,s.jiraProject),old=issues.get(row.key);if(old&&hash(old)!==hash(row))throw Error('Задачи изменились между страницами. Повторите проверку.');issues.set(row.key,row);}
   if(data.isLast===false&&!data.nextPageToken?.trim())throw Error('Jira не вернула следующую страницу. Создание не разрешено по частичному списку.');
   if(data.isLast===true||!data.nextPageToken){token=null;break;}if(seen.has(data.nextPageToken))throw Error('Jira повторила страницу. Повторите проверку.');seen.add(data.nextPageToken);token=data.nextPageToken;
  }
  if(token||issues.size>10000)throw Error('Слишком много задач для полной проверки дублей в проекте.');
  return tasks.map(task=>{const matches=[...issues.values()].map(i=>similarity(task,i)).filter(Boolean).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));return {fingerprint:taskHash(task),matches:matches.slice(0,5),matchCount:matches.length,catalog:hash(matches.map(i=>[i.key,i.updated,i.summary,i.description]).sort())};});
 }
 prior(task,s){return this.state.taskDuplicateOps.find(r=>r.task===task&&r.site===s.jiraUrl&&r.project===s.jiraProject&&['sent','unknown','sending'].includes(r.status));}
 async prepare(id,prepared,s){require('./workspace.cjs').validateTasks(prepared.tasks,null,false);if(!Array.isArray(prepared.tasks)||!prepared.tasks.length)throw Error('Нет поручений для проверки.');const seen=new Set();for(const t of prepared.tasks){const h=taskHash(t);if(seen.has(h))throw Error('В плане повторяется одно и то же поручение. Удалите повтор перед созданием.');seen.add(h);}
  const epoch=this.epoch,scope=this.scope(s),entries=await this.scan(prepared.tasks,s,scope);if(epoch!==this.epoch)throw Error('Контекст удалён.');
  const previous=this.plans.get(id);const plan={id,settings:{...s},scope,topic:this.context()?.id,at:this.now(),tasks:structuredClone(prepared.tasks),entries};
  entries.forEach(e=>{const old=previous?.entries.find(x=>x.fingerprint===e.fingerprint&&x.catalog===e.catalog);if(old?.decision)e.decision=old.decision;const prior=this.prior(e.fingerprint,s);if(prior?.status==='sent')e.decision={kind:'existing',key:prior.key};else if(prior)e.uncertain=prior.key;});
  if(this.pending?.planId===id)this.pending=null;this.plans.set(id,plan);for(const [key,value] of this.plans)if(this.now()-value.at>600000&&key!==id)this.plans.delete(key);const questions=[...(prepared.questions||[])];entries.forEach((e,i)=>{if(e.uncertain)questions.push('Поручение '+(i+1)+': результат прежнего обновления '+e.uncertain+' неизвестен. Проверьте Jira; новая задача не будет создана.');else if(e.matches.length&&!e.decision)questions.push('Поручение '+(i+1)+': возможные совпадения — '+e.matches.map(m=>m.key+' «'+m.summary+'» ('+m.status+')').join('; ')+'. Напишите «проверь дубли плана», чтобы выбрать существующую или новую задачу.');});
  return {...prepared,questions,duplicateCheck:{planId:id,project:s.jiraProject,at:this.now(),accessibleOnly:true,method:'Сходство названий и словарь распространённых синонимов; совпадение не является доказательством дубля.',entries:entries.map((e,i)=>({index:i,total:e.matchCount,matches:e.matches.map(m=>({key:m.key,summary:m.summary,status:m.status,reason:m.reason,url:s.jiraUrl+'/browse/'+m.key})),resolved:!!e.decision}))}};
 }
 activePlan(){return [...this.plans.values()].reverse().find(p=>p.topic===this.context()?.id);}
 valid(plan){if(!plan||this.plans.get(plan.id)!==plan||this.now()-plan.at>600000)throw Error('Проверка дублей устарела. Подготовьте план снова.');this.check(plan.settings,plan.scope);}
 reply(text,extra={}){return {handled:true,text,...extra};}
 offer(plan){this.valid(plan);const index=plan.entries.findIndex(e=>e.uncertain||e.matches.length&&!e.decision);if(index<0){this.pending=null;const reused=plan.entries.filter(e=>e.decision?.kind==='existing').length;return this.reply(reused===plan.entries.length?'Все поручения добавлены в существующие задачи. Новые задачи создавать не нужно; план можно закрыть.':'Проверка завершена. Вернитесь к плану: при отправке будут созданы только новые задачи.');}const e=plan.entries[index];if(e.uncertain)return this.reply('Результат обновления '+e.uncertain+' неизвестен. Проверьте задачу Jira. Повтор и создание дубля заблокированы.',{error:true});
  const token=randomUUID(),options=e.matches.map(m=>({id:'dup:'+token+':use:'+m.key,label:'Дополнить '+m.key})).concat([{id:'dup:'+token+':new',label:'Создать отдельную новую задачу'},{id:'dup:'+token+':cancel',label:'Отложить выбор'}]);this.pending={token,planId:plan.id,index,options,at:this.now()};
  return this.reply('Поручение '+(index+1)+': '+plan.tasks[index].summary+'\n'+e.matches.map(m=>m.key+' — '+m.summary+' ['+m.status+']\n'+m.reason).join('\n\n')+(e.matchCount>5?'\nПоказаны 5 из '+e.matchCount+' совпадений.':'')+'\nВыбор существующей задачи добавит сведения встречи комментарием; поля, статус и спринт не изменятся.',{question:true,options,sources:e.matches.map(m=>({title:m.key,url:plan.settings.jiraUrl+'/browse/'+m.key}))});
 }
 async turn(command,choice){
  const explicit=/^(?:петя[,\s]*)?(?:проверь|разбери|покажи)\s+(?:дубли|совпадения)(?:\s+(?:плана|задач))?[.!?]*$/iu.test(String(command).trim());
  if(this.busy){if(explicit||String(choice||'').startsWith('dup:'))return this.reply('Дождитесь текущей проверки или обновления.',{error:true});return null;}
  if(explicit)return this.offer(this.activePlan());
  let selected=choice;if(!selected&&this.pending){const options=this.pending.options;selected=options[Number(String(command).trim())-1]?.id||options.find(o=>o.label.toLocaleLowerCase()===String(command).trim().toLocaleLowerCase())?.id;}
  if(!String(selected||'').startsWith('dup:')){this.pending=null;return null;}
  const pending=this.pending,plan=pending&&this.plans.get(pending.planId);this.valid(plan);if(!pending||this.now()-pending.at>600000||!pending.options.some(o=>o.id===selected))throw Error('Выбор устарел. Напишите «проверь дубли плана».');
  const e=plan.entries[pending.index];this.busy=true;
  try{
   if(selected.endsWith(':cancel')){this.pending=null;return this.reply('Выбор отложен. Совпадающие поручения не будут созданы без решения.');}
   const current=(await this.scan([plan.tasks[pending.index]],plan.settings,plan.scope))[0];if(current.catalog!==e.catalog){e.matches=current.matches;e.matchCount=current.matchCount;e.catalog=current.catalog;delete e.decision;this.pending=null;return this.reply('Совпадения в Jira изменились. Напишите «проверь дубли плана» для нового выбора.',{error:true});}
   if(selected.endsWith(':new')){e.decision={kind:'new'};this.pending=null;return this.offer(plan);}
   const key=selected.split(':').at(-1),candidate=e.matches.find(m=>m.key===key);if(!candidate)throw Error('Задача не входит в показанные совпадения.');
   const comment='Поручение по итогам встречи: '+plan.tasks[pending.index].summary+'\n\n'+plan.tasks[pending.index].description;if(comment.length>16000)throw Error('Сократите описание поручения до 16000 символов перед обновлением.');
   if(selected.includes(':use:')){const token=randomUUID(),options=[{id:'dup:'+token+':confirm:'+key,label:'Добавить комментарий в '+key},{id:'dup:'+token+':cancel',label:'Отложить выбор'}];this.pending={token,planId:plan.id,index:pending.index,options,at:this.now()};return this.reply('В '+key+' будет добавлен комментарий:\n\n'+comment,{question:true,options});}
   const outcome=await this.update(plan,e,candidate,comment);this.pending=null;
   if(outcome.status==='sent'){e.decision={kind:'existing',key};const next=this.offer(plan);return {...next,text:'Сведения добавлены в '+key+'. Новая задача для этого поручения не создаётся.\n\n'+next.text,sources:[{title:key,url:plan.settings.jiraUrl+'/browse/'+key+'?focusedCommentId='+outcome.commentId},...(next.sources||[])]};}
   if(outcome.status==='unknown')e.uncertain=key;return this.reply(outcome.status==='rejected'?'Jira отклонила комментарий. Исправьте причину и повторите выбор.':'Jira не подтвердила обновление '+key+'. Проверьте задачу; автоматический повтор и создание дубля отключены.',{error:true,sources:[{title:key,url:plan.settings.jiraUrl+'/browse/'+key}]});
  }finally{this.busy=false;}
 }
 async update(plan,entry,candidate,comment){
  const prior=this.prior(entry.fingerprint,plan.settings);if(prior)return prior;
  const s=plan.settings;this.valid(plan);const live=issueData(await this.workspace.api('/rest/api/3/issue/'+candidate.key+'?fields=summary,description,status,updated,project',{},s),s.jiraProject);this.valid(plan);
  if(live.updated!==candidate.updated||live.summary!==candidate.summary||live.description!==candidate.description||live.status!==candidate.status)throw Error('Задача изменилась после просмотра. Повторите проверку дублей.');
  if(this.state.taskDuplicateOps.length>=500)throw Error('История обновлений заполнена.');const row={id:randomUUID(),task:entry.fingerprint,site:s.jiraUrl,project:s.jiraProject,key:candidate.key,status:'sending',at:this.now()};this.state.taskDuplicateOps.push(row);try{this.save();}catch(error){this.state.taskDuplicateOps.pop();throw error;}
  let result;try{result=await this.workspace.api('/rest/api/3/issue/'+candidate.key+'/comment',{method:'POST',body:JSON.stringify({body:adf(comment)})},s);}catch(error){row.status=error.status>=400&&error.status<500&&![408,429].includes(error.status)?'rejected':'unknown';try{this.save();}catch{}return row;}
  row.status=/^\d+$/.test(String(result?.id||''))?'sent':'unknown';if(row.status==='sent')row.commentId=String(result.id);try{this.save();}catch{row.persistenceWarning=true;}return row;
 }
 assertSubmission(id){try{if(this.revoked.has(id))throw Error('Контекст плана удалён. Подготовьте новый план.');const cached=this.submissions.get(id);if(cached)this.check(cached.settings,cached.scope);}catch(error){error.beforeWrite=true;throw error;}}
 async guard(input,s){
  if(this.revoked.has(input.id))throw Error('Контекст плана удалён. Подготовьте новый план.');
  const cached=this.submissions.get(input.id);if(cached&&(this.workspace.batches?.has(input.id)||this.workspace.history?.some(h=>h.id===input.id))){if(cached.original!==hash(input))throw Error('После начала отправки нельзя менять план.');this.check(s,cached.scope);return cached.input;}
  if(this.workspace.history?.some(h=>h.id===input.id))throw Error('Этот план уже отправлялся. Проверьте историю; повтор после перезапуска заблокирован.');
  let plan=this.plans.get(input.id);if(!plan){await this.prepare(input.id,{tasks:input.tasks,questions:[]},s);plan=this.plans.get(input.id);}this.valid(plan);
  if(s.jiraUrl!==plan.settings.jiraUrl||s.jiraProject!==plan.settings.jiraProject)throw Error('Выбран другой проект. Повторите проверку.');
  await this.prepare(input.id,{tasks:input.tasks,questions:[]},s);const fresh=this.plans.get(input.id);
  if(fresh.entries.some(e=>e.uncertain||e.matches.length&&!e.decision))throw Error('Есть неразобранные совпадения. Напишите «проверь дубли плана». Новые задачи пока не созданы.');
  const existing=new Map(fresh.entries.map((e,i)=>[i,e.decision?.kind==='existing'?e.decision.key:null]).filter(([,key])=>key));
  for(const key of new Set(existing.values())){issueData(await this.workspace.api('/rest/api/3/issue/'+key+'?fields=summary,description,status,updated,project',{},s),s.jiraProject);this.valid(fresh);}
  const keep=input.tasks.map((_,i)=>i).filter(i=>!existing.has(i)),map=new Map(keep.map((old,i)=>[old,i]));
  if(!keep.length)throw Error('Все поручения уже добавлены в существующие задачи. Новые задачи не нужны; закройте план.');
  const tasks=keep.map(i=>{const task=input.tasks[i],deps=task.dependsOn||[];const linked=deps.filter(d=>existing.has(d)).map(d=>existing.get(d));return {...task,description:task.description+(linked.length?'\n\nЗависимости от существующих задач: '+linked.join(', '):''),dependsOn:deps.filter(d=>!existing.has(d)).map(d=>{if(!map.has(d))throw Error('Некорректная зависимость в плане.');return map.get(d);})};});
  const transformed={...input,tasks};this.submissions.set(input.id,{original:hash(input),input:transformed,settings:{...s},scope:this.scope(s)});return transformed;
 }
}
module.exports={TaskDuplicates,similarity,terms,taskHash};
