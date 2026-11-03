const {allowed,choose}=require('./jira-routing.cjs');
const quote=s=>'"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
class JiraInsights {
 constructor(workspace){this.w=workspace;}
 async read(command,topic,context=''){
  const s={...this.w.settings()};if(s.module_jira==='false')throw new Error('Включите Jira в подключениях.');
  const projects=(await this.w.pages('/rest/api/3/project/search?status=live&expand=description',s)).filter(p=>allowed(s).includes(p.key));
  if(!projects.length)throw new Error('Подключите Jira и отметьте доступные проекты.');
  const explicit=choose(command,{title:'',text:''},projects);
  let project=explicit.project;
  // A named different project takes precedence over the remembered one.
  if(!project && !/разные проекты/.test(explicit.reason))project=projects.find(p=>p.key===topic.jiraProject)||choose(command,{title:'',text:context},projects).project;
  if(!project)return {question:'В каком проекте посмотреть баги?',field:'jiraProject',options:projects.map(p=>({id:p.key,label:p.name+' ('+p.key+')'}))};
  topic.jiraProject=project.key;
  const [versions,details]=await Promise.all([this.w.api('/rest/api/3/project/'+encodeURIComponent(project.key)+'/versions',{},s),this.w.api('/rest/api/3/project/'+encodeURIComponent(project.key),{},s)]);
  if(!versions.length)throw new Error('В проекте Jira пока нет версий. Уточните проект или добавьте релизы в Jira.');
  const named=versions.filter(v=>new RegExp('(?:^|[^\\p{L}\\p{N}.])'+String(v.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}.])','iu').test(command));
  let version=named.length===1?named[0]:versions.find(v=>String(v.id)===topic.versionId);
  const released=versions.filter(v=>v.released&&v.releaseDate&&v.releaseDate<=new Date().toISOString().slice(0,10)).sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate));
  if(/последн|свеж|текущ/iu.test(command)||!version)version=released[0]&&released[0].releaseDate!==released[1]?.releaseDate?released[0]:null;
  if(/предыдущ/iu.test(command)){const index=released.findIndex(v=>String(v.id)===topic.versionId);version=released[index>=0?index+1:1];}
  if(named.length>1)version=null;
  if(!version)return {question:'Какую версию проверить? Последнюю выпущенную не удалось определить однозначно.',field:'versionId',options:versions.filter(v=>!v.archived).map(v=>({id:String(v.id),label:v.name+(v.released?' · выпущена':' · ещё не выпущена')}))};
  topic.versionId=String(version.id);
  const bugTypes=(details.issueTypes||[]).filter(t=>/bug|баг|ошиб|дефект/iu.test(t.name));
  if(!bugTypes.length)throw new Error('В проекте не найден тип «Баг». Не буду считать все задачи багами.');
  const field=/исправлен|исправления|fixversion/iu.test(command)?'fixVersion':/затронут|affected/iu.test(command)?'affectedVersion':topic.versionField||'affectedVersion';topic.versionField=field;
  const jql=`project = ${quote(project.key)} AND issuetype IN (${bugTypes.map(t=>quote(t.id)).join(',')}) AND ${field} = ${quote(version.id)} ORDER BY key ASC`;
  let token;const issues=new Map(),seen=new Set();
  for(let page=0;page<100;page++){
   const result=await this.w.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['summary','status','priority'],...token?{nextPageToken:token}:{}})},s);
   for(const issue of result.issues||[])issues.set(issue.id||issue.key,issue);
   if(result.isLast===true||!result.nextPageToken){token=null;break;}
   if(seen.has(result.nextPageToken))throw new Error('Jira повторила страницу результатов; точный подсчёт недоступен.');
   seen.add(result.nextPageToken);token=result.nextPageToken;
  }
  if(token)throw new Error('Больше 10 000 багов: сузьте запрос, чтобы получить точное число.');
  const rows=[...issues.values()],open=rows.filter(i=>i.fields?.status?.statusCategory?.key&&i.fields.status.statusCategory.key!=='done').length;
  const byPriority={};for(const issue of rows){const name=issue.fields?.priority?.name||'Без приоритета';byPriority[name]=(byPriority[name]||0)+1;}
  const priorityText=/критич|приоритет|блокир/iu.test(command)?' По приоритетам: '+Object.entries(byPriority).map(([k,v])=>k+' — '+v).join(', ')+'.':'';
  return {text:`${project.name}, версия ${version.name}: найдено ${rows.length} багов, из них незавершённых — ${open}.${priorityText} Считал по полю «${field==='affectedVersion'?'Затронутые версии':'Исправить в версиях'}». Проверено сейчас; учитываются доступные вашему аккаунту задачи.`,sources:[{title:'Результаты Jira',url:s.jiraUrl+'/issues/?jql='+encodeURIComponent(jql)}],data:{project:project.key,version:version.name,total:rows.length,open,byPriority,field,at:Date.now(),issues:rows.slice(0,20).map(i=>({key:i.key,summary:i.fields?.summary,status:i.fields?.status?.name}))},title:`Баги · ${project.name}`};
 }
}
module.exports={JiraInsights};
