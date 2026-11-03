'use strict';
const {randomUUID}=require('node:crypto');
const BASE='https://app.asana.com/api/1.0';
const gid=v=>{if(typeof v!=='string'||!/^\d{1,40}$/.test(v))throw new Error('Некорректный ID Asana.');return v;};
const taskFields='name,notes,completed,due_on,modified_at,workspace.gid,projects.gid,permalink_url';
function values(v){
 if(!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>1000||typeof v.notes!=='string'||v.notes.length>50000||typeof v.completed!=='boolean')throw new Error('Проверьте название и описание задачи.');
 if(v.due_on!==null&&(typeof v.due_on!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.due_on)||new Date(v.due_on).toISOString().slice(0,10)!==v.due_on))throw new Error('Некорректный срок.');
 return {name:v.name.trim(),notes:v.notes,completed:v.completed,due_on:v.due_on};
}
class Asana {
 constructor({settings,request}){this.settings=settings;this.request=request;this.previews=new Map();}
 session(){const s=this.settings();if(!s.asanaCredential)throw new Error('Подключите Asana в настройках.');return {credential:s.asanaCredential,workspace:gid(s.asanaWorkspace)};}
 same(s){const n=this.session();if(n.credential!==s.credential||n.workspace!==s.workspace)throw new Error('Подключение Asana изменилось. Повторите действие.');}
 async api(route,options={}){return this.request(BASE+route,options);}
 async list(route,fields,offset){this.session();if(offset!=null&&(typeof offset!=='string'||offset.length>4096))throw new Error('Некорректная страница.');const q=new URLSearchParams({limit:'100',opt_fields:fields});if(offset)q.set('offset',offset);const s=this.session();const r=await this.api(route+'?'+q);this.same(s);if(!Array.isArray(r.data))throw new Error('Некорректный ответ Asana.');return {items:r.data,next:r.next_page?.offset||null};}
 projects(offset){return this.list('/workspaces/'+this.session().workspace+'/projects','name,archived',offset);}
 async project(id){const s=this.session();const r=await this.api('/projects/'+gid(id)+'?opt_fields=name,workspace.gid,archived');this.same(s);if(r.data?.workspace?.gid!==s.workspace)throw new Error('Проект находится в другом рабочем пространстве.');return r.data;}
 async tasks(project,offset){await this.project(project);return this.list('/projects/'+gid(project)+'/tasks','name,completed',offset);}
 async task(id){const s=this.session();const r=await this.api('/tasks/'+gid(id)+'?opt_fields='+taskFields);this.same(s);if(r.data?.workspace?.gid!==s.workspace)throw new Error('Задача находится в другом рабочем пространстве.');return r.data;}
 async preview(input){
  const s=this.session(),after=values(input),project=await this.project(input.project);if(project.archived)throw new Error('Проект архивный.');
  let before=null;if(input.task){before=await this.task(input.task);if(!before.projects?.some(p=>p.gid===project.gid))throw new Error('Задача больше не входит в выбранный проект.');}
  this.same(s);const now=Date.now();for(const [key,p] of this.previews)if(now-p.at>600000)this.previews.delete(key);
  if(this.previews.size>=100)throw new Error('Слишком много неподтверждённых изменений.');
  const id=randomUUID();this.previews.set(id,{s,project:project.gid,task:before?.gid,before,after,at:now});return {id,project:project.name,before:before?values(before):null,after};
 }
 async prepareVoice(command, context, composeDraft, projectKey = '') {
    const projects = []; let offset = null; const seen = new Set();
    do { if(seen.has(offset)) throw new Error('Asana повторила страницу проектов. Повторите позже.'); seen.add(offset); const page = await this.projects(offset); projects.push(...page.items.filter(p=>!p.archived).map(p=>({key:p.gid,name:p.name}))); offset = page.next; if(projects.length > 1000 || seen.size > 10) throw new Error('Слишком много проектов Asana. Уточните рабочее пространство.'); } while(offset);
    if (!projects.length) throw new Error('Нет доступных проектов Asana.');
    const selection = projectKey ? {project:projects.find(p=>p.key===projectKey)} : require('./jira-routing.cjs').choose(command,context,projects);
    if (projectKey && !selection.project) throw new Error('Проект Asana недоступен.');
    if (!selection.project) return {ready:false,projects,reason:'В каком проекте Asana создать задачу?'};
    const draft = await composeDraft(command,context);
    if (draft.questions?.length) return {ready:false,project:selection.project.key,questions:draft.questions};
    const preview = await this.preview({project:selection.project.key,task:null,name:draft.summary,notes:draft.description,completed:false,due_on:null});
    return {ready:true,...preview};
 }
 async apply(id){
  const p=this.previews.get(id);if(!p)throw new Error('Предпросмотр уже использован. Обновите список задач перед новым действием.');
  this.previews.delete(id);if(Date.now()-p.at>600000)throw new Error('Предпросмотр устарел.');this.same(p.s);
  const project=await this.project(p.project);if(project.archived)throw new Error('Проект архивный.');
  if(p.task){const now=await this.task(p.task);if(now.modified_at!==p.before.modified_at||JSON.stringify(values(now))!==JSON.stringify(values(p.before))||!now.projects?.some(x=>x.gid===p.project))throw new Error('Задача изменилась в Asana. Загрузите её заново.');}
  this.same(p.s);
  try {const r=await this.api(p.task?'/tasks/'+p.task:'/tasks',{method:p.task?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{...p.after,...(!p.task?{workspace:p.s.workspace,projects:[p.project]}:{})}})});if(!r.data?.gid)throw new Error('Неожиданный ответ');return {gid:r.data.gid,url:'https://app.asana.com/0/'+p.project+'/'+gid(r.data.gid)};}
  catch(e){throw new Error('Отправка не подтверждена: '+e.message+'. Сначала проверьте задачу в Asana. Автоматического повтора не будет.');}
 }
}
module.exports={Asana,values};
