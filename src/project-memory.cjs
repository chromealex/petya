const {randomUUID}=require('node:crypto');
const clean=s=>String(s||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/,'').trim();
const norm=s=>clean(s).toLocaleLowerCase().replace(/ё/g,'е');
const roleOf=s=>/разработ|\bdev\b/iu.test(s)?'dev':/тест|\bqa\b/iu.test(s)?'qa':'default';
class ProjectMemory {
 constructor({state={version:1,projects:[]},save,topic,switchProject,verify,scope,slackAccount,now=Date.now}) {
  if(state.version!==1||!Array.isArray(state.projects)||state.projects.length>100)throw Error('Повреждена память проектов.');
  Object.assign(this,{state,save,topic,switchProject,verify,scope,slackAccount,now});this.pending=null;this.busy=false;
 }
 active(){return this.state.projects.find(p=>p.id===this.topic()?.projectMemoryId)||null;}
 get(id){return this.state.projects.find(p=>p.id===id)||null;}
 commit(next){this.save(next);this.state=next;}
 reply(text,extra={}){return {handled:true,text,...extra};}
 ask(text,prefix){this.pending={prefix,scope:this.scope(),topic:this.topic()?.id,at:this.now()};return this.reply(text,{question:true,projectMemoryReply:true});}
 context(){const p=this.active();if(!p)return {};return {id:p.id,name:p.name,jira:p.jira,repo:p.repo,members:p.members||[],projectChannels:Object.values(p.slack||{}).filter(c=>c.account===this.slackAccount()).map(c=>({id:c.id,role:c.role,name:c.name})),hasSavedChannels:Object.keys(p.slack||{}).length>0};}
 async turn(raw,answer=false){
  const text=clean(raw);
  if(this.busy)return /^(?:работаем|переключись|запомни|забудь)/iu.test(text)?this.reply('Сохраняю связь проекта. Дождитесь результата.'):null;
  if(answer){const p=this.pending;this.pending=null;if(!p||p.scope!==this.scope()||p.topic!==this.topic()?.id||this.now()-p.at>600000)return this.reply('Уточнение устарело. Повторите команду.');if(/^(?:отмена|не надо|стоп)$/iu.test(text))return this.reply('Отменено.');if(p.prefix==='Работаем над проектом '){const options=this.state.projects.slice(0,8).map(p=>({id:p.id,label:p.name}));const matches=require('./dialogue.cjs').selectChoice(text,options);if(matches.length===1)return this.turn(p.prefix+matches[0].label);if(/^\d+$|^(?:первый|второй|третий)$/iu.test(text))return this.ask('Выбери проект: '+options.map((p,i)=>(i+1)+' — '+p.label).join(', '),p.prefix);}return this.turn(p.prefix+text);}
  if(/^(?:теперь )?работаем над другим проектом$/iu.test(text))return this.ask('Какой проект выбрать? '+this.state.projects.slice(0,8).map(p=>p.name).join(', '),'Работаем над проектом ');
  let m=/^(?:(?:теперь\s+)?работаем\s+(?:над|с)\s+проектом|переключись\s+на\s+проект|выбери\s+проект)\s*(.*)$/iu.exec(text);
  if(m){
   if(!m[1]||/^(?:другим|другой)$/iu.test(m[1]))return this.ask('Какой проект выбрать? '+this.state.projects.slice(0,8).map(p=>p.name).join(', '),'Работаем над проектом ');
   const name=m[1].replace(/^[«"]|[»"]$/g,'').trim();if(name.length>100)return this.reply('Название проекта должно быть не длиннее 100 символов.',{error:true});
   let project=this.state.projects.find(p=>norm(p.name)===norm(name));
   if(!project){if(this.state.projects.length>=100)return this.reply('В памяти уже 100 проектов. Удалите ненужный проект.',{error:true});project={id:randomUUID(),name,slack:{},members:[],at:this.now()};this.commit({...this.state,projects:[...this.state.projects,project]});}
   this.pending=null;this.switchProject(project);return this.reply('Работаем над проектом «'+project.name+'». Прежний тред не перенесён.',{projectChanged:true,topicTitle:'Проект · '+project.name});
  }
  if(/^(?:какой (?:сейчас |текущий )?проект|покажи (?:связи|память) проекта)$/iu.test(text)){
   const p=this.active();if(!p)return this.reply('Рабочий проект не выбран. Скажите «работаем над проектом» и название.');
   return this.reply('Проект «'+p.name+'». '+Object.values(p.slack||{}).map(c=>'Slack '+c.role+': #'+c.name).join('; ')+(p.jira?'; Jira: '+p.jira.key:'')+(p.repo?'; репозиторий: '+p.repo.value:'')+(p.members?.length?'; участники: '+p.members.map(m=>m.name).join(', '):''));
  }
  m=/^забудь проект\s+(?!jira$)(.+)$/iu.exec(text);
  if(m){const p=this.state.projects.find(p=>norm(p.name)===norm(m[1]));if(!p)return this.reply('Такого проекта нет в памяти.');const active=this.active()?.id===p.id;this.commit({...this.state,projects:this.state.projects.filter(v=>v.id!==p.id)});if(active)this.switchProject(null);this.pending=null;return this.reply('Связи проекта удалены. Сам репозиторий и данные сервисов не изменены.',{projectChanged:active});}
  const correction=/^(?:нет[,\s]+)?(?:по|для) этому?\s*проекту\s+пишем\s+(.+)$/iu.exec(text)||/^(?:нет[,\s]+)?для этого проекта пишем\s+(.+)$/iu.exec(text);
  m=/^(?:запомни[,\s]*|сохрани\s+)(?:для этого проекта\s+)?(канал(?:\s+(?:разработки|тестирования|dev|qa))?|проект (?:jira|жиры)|репозиторий|участника?)\s*[:—-]?\s*(.*)$/iu.exec(text);
  const forget=/^забудь\s+(канал(?:\s+(?:разработки|тестирования|dev|qa))?|репозиторий|проект jira)$/iu.exec(text);
  if(!m&&!correction&&!forget){this.pending=null;return null;}
  const project=this.active();if(!project)return this.ask('Сначала назовите рабочий проект.','Работаем над проектом ');
  const field=correction?'канал':m?.[1]||forget[1];
  const kind=/канал/iu.test(field)?'slack':/jira|жиры/iu.test(field)?'jira':/репозиторий/iu.test(field)?'repo':'member';
  const role=correction?(project.lastSlackRole||'default'):roleOf(field);
  let value=correction?correction[1]:m?.[2]||'';
  if(forget){const next=structuredClone(this.state),p=next.projects.find(p=>p.id===project.id);if(kind==='slack')delete p.slack[role];else delete p[kind];this.commit(next);return this.reply('Связь удалена для проекта «'+p.name+'».');}
  if(!value)return this.ask('Что сохранить для проекта «'+project.name+'»?','Запомни '+field+' ');
  if(kind==='slack'){value=value.replace(/^в\s+/iu,'');if(/^сюда$/iu.test(value)){try{value=/\/archives\/([CG][A-Z0-9]+)/.exec(new URL(this.topic()?.slackSource?.url).pathname)?.[1]||'';}catch{value='';}if(!value)return this.ask('В текущем обсуждении нет точного канала Slack. Назовите канал.','Запомни канал '+(role==='dev'?'разработки ':role==='qa'?'тестирования ':''));}}
  this.busy=true;const before=JSON.stringify(this.state),scope=this.scope(),topic=this.topic()?.id;
  try{
   const checked=await this.verify(kind,value);
   if(before!==JSON.stringify(this.state)||scope!==this.scope()||topic!==this.topic()?.id)throw Error('Контекст изменился. Повторите сохранение связи.');
   const next=structuredClone(this.state),p=next.projects.find(p=>p.id===project.id);
   if(kind==='slack'){p.slack[role]={...checked,role,account:this.slackAccount(),at:this.now()};p.lastSlackRole=role;}
   else if(kind==='member'){if(!p.members.some(m=>m.id===checked.id))p.members.push(checked);}
   else p[kind]={...checked,at:this.now()};
   p.at=this.now();this.commit(next);
   return this.reply('Запомнил для проекта «'+p.name+'»: '+(kind==='slack'?'канал #'+checked.name:kind==='jira'?'Jira '+checked.key:kind==='repo'?'репозиторий '+checked.value:'участник '+checked.name)+'.');
  }catch(e){return this.reply('Связь не сохранена: '+e.message,{error:true});}finally{this.busy=false;}
 }
}
// Whether the text is a project-memory command (switch, current project, forget, remember a link).
const matches=raw=>{const t=clean(raw);return /^(?:(?:теперь\s+)?работаем\s+(?:над|с)\s+(?:другим\s+)?проектом|переключись\s+на\s+проект|выбери\s+проект)/iu.test(t)||/^(?:какой (?:сейчас |текущий )?проект|покажи (?:связи|память) проекта)$/iu.test(t)||/^забудь проект\s+\S/iu.test(t)||/^(?:запомни[,\s]*|сохрани\s+)(?:для этого проекта\s+)?(?:канал|проект (?:jira|жиры)|репозиторий|участника?)/iu.test(t);};
module.exports={ProjectMemory,matches};
