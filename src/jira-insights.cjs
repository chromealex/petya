const {allowed,choose}=require('./jira-routing.cjs');
const quote=s=>'"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
// Keep the evidence needed for follow-up questions without full user profiles
// or nested linked issue payloads consuming the model's context window.
function evidenceIssue(issue){
 const f=issue.fields||{},fields={};
 for(const name of ['summary','duedate','updated'])if(Object.hasOwn(f,name))fields[name]=f[name];
 if(Object.hasOwn(f,'status'))fields.status=f.status?{name:f.status.name,statusCategory:{key:f.status.statusCategory?.key}}:null;
 if(Object.hasOwn(f,'priority'))fields.priority=f.priority?{name:f.priority.name}:null;
 if(Object.hasOwn(f,'assignee'))fields.assignee=f.assignee?{accountId:f.assignee.accountId,displayName:f.assignee.displayName}:null;
 if(Array.isArray(f.issuelinks))fields.issuelinks=f.issuelinks.map(link=>({type:{name:link.type?.name,inward:link.type?.inward,outward:link.type?.outward},...(link.inwardIssue?{inwardIssue:{key:link.inwardIssue.key}}:{}),...(link.outwardIssue?{outwardIssue:{key:link.outwardIssue.key}}:{})}));
 return {id:issue.id,key:issue.key,fields};
}
class JiraInsights {
 constructor(workspace){this.w=workspace;}
 async read(command,topic,context='',kind='bugs',options={}){
  const tasks=kind==='tasks',personalFilter=tasks?require('./personal-tasks.cjs').details(command,topic):null,personal=!!personalFilter;
  const personalStatus=personalFilter?.status||'',personalOverdue=!!personalFilter?.overdue;
  const unversioned=personal&&!/верс|релиз/iu.test(command);
  if(tasks){topic.taskAssignee=personal?'currentUser':'';topic.personalTaskStatus=personalStatus;topic.personalTaskOverdue=personalOverdue;}
  if(unversioned){delete topic.versionId;delete topic.versionField;}
  const s={...this.w.settings()};const signature=v=>JSON.stringify([v.jiraUrl,v.jiraProjects,v.jiraProject,v.jiraEmail,v.jiraToken,v.atlassianCredential,v.module_jira]);const check=()=>{if(signature(s)!==signature(this.w.settings()))throw Error('Подключение или доступные проекты Jira изменились во время чтения. Повторите запрос.');};const api=async(...args)=>{check();const value=await this.w.api(...args);check();return value;};if(s.module_jira==='false')throw new Error('Включите Jira в подключениях.');
  const projects=(await this.w.pages('/rest/api/3/project/search?status=live&expand=description',s)).filter(p=>allowed(s).includes(p.key));
  check();
  if(!projects.length)throw new Error('Подключите Jira и отметьте доступные проекты.');
  if(options.wholeProject){delete topic.versionId;delete topic.versionField;}
  const explicit=choose(command,{title:'',text:''},projects);
  const explicitMatches=require('./jira-routing.cjs').matches(command,projects);
  const unspecified=/^Примени скилл к данным текущей темы[.]/.test(command)||/^(?:в )?(?:текущем|этом) проекте[.!?]*$/iu.test(command.trim());
  // A status the user named in passing («таски в new») counts only if Jira has a status with that name.
  if(personalFilter?.guess){const statuses=await api('/rest/api/3/status',{},s).catch(()=>[]);const found=(Array.isArray(statuses)?statuses:[]).find(v=>String(v?.name||'').toLowerCase()===personalFilter.name.toLowerCase());if(found)personalFilter.name=found.name;else delete personalFilter.name;delete personalFilter.guess;}
  const namedKey=/(?:проект[еу]?|(?:теперь )?в)\s+([A-Z][A-Z0-9_-]*)\b/u.exec(command)?.[1];
  if(namedKey&&!projects.some(p=>p.key===namedKey))return {question:'Проект '+namedKey+' недоступен. Выбери доступный проект.',field:'jiraProject',options:projects.map(p=>({id:p.key,label:p.name+' ('+p.key+')'}))};
  let project=explicit.project;
  if(options.wholeProject&&!explicitMatches.length&&!unspecified)project=null;
  // Reports never silently substitute the remembered project for an unknown name.
  if(!project && !/разные проекты/.test(explicit.reason)&&(!options.wholeProject||unspecified))project=projects.find(p=>p.key===topic.jiraProject)||choose(command,{title:'',text:context},projects).project;
  // «Мои задачи» without a project means every project available to the account.
  const everywhere=!project&&personal&&unversioned&&!options.wholeProject;
  if(!project&&!everywhere)return {question:tasks?'В каком проекте посмотреть задачи?':'В каком проекте посмотреть баги?',field:'jiraProject',options:projects.map(p=>({id:p.key,label:p.name+' ('+p.key+')'}))};
  if(everywhere)project={key:'',name:'все доступные ('+projects.map(p=>p.key).join(', ')+')'};else topic.jiraProject=project.key;
  let account,dueDay;if(personal){account=await api('/rest/api/3/myself',{},s);if(!account||typeof account.accountId!=='string'||!account.accountId.trim())throw Error('Не удалось определить подключённый аккаунт Jira. Личный список не составлен.');if(personalOverdue){if(!account.timeZone)throw Error('Не получен часовой пояс аккаунта Jira для проверки сроков.');try{dueDay=new Intl.DateTimeFormat('sv-SE',{timeZone:account.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch{throw Error('Некорректный часовой пояс Jira.');}}}
  const [versions,details]=(options.wholeProject&&tasks||unversioned)?[[],{}]:await Promise.all([api('/rest/api/3/project/'+encodeURIComponent(project.key)+'/versions',{},s),api('/rest/api/3/project/'+encodeURIComponent(project.key),{},s)]);
  if(!tasks&&!versions.length)throw new Error('В проекте Jira пока нет версий. Уточните проект или добавьте релизы в Jira.');
  const named=versions.filter(v=>new RegExp('(?:^|[^\\p{L}\\p{N}.])'+String(v.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}.])','iu').test(command));
  let version=named.length===1?named[0]:versions.find(v=>String(v.id)===topic.versionId);
  const released=versions.filter(v=>v.released&&v.releaseDate&&v.releaseDate<=new Date().toISOString().slice(0,10)).sort((a,b)=>b.releaseDate.localeCompare(a.releaseDate));
  if(/последн|свеж|текущ/iu.test(command)||(!tasks&&!version))version=released[0]&&released[0].releaseDate!==released[1]?.releaseDate?released[0]:null;
  if(/предыдущ/iu.test(command)){const index=released.findIndex(v=>String(v.id)===topic.versionId);version=released[index>=0?index+1:1];}
  if(named.length>1)version=null;
  if(!options.wholeProject&&!version&&(!tasks||/верс|релиз/iu.test(command)))return {question:'Какую версию проверить? Последнюю выпущенную не удалось определить однозначно.',field:'versionId',options:versions.filter(v=>!v.archived).map(v=>({id:String(v.id),label:v.name+(v.released?' · выпущена':' · ещё не выпущена')}))};
  if(options.wholeProject)version=null;
  if(version)topic.versionId=String(version.id);
  const bugTypes=(details.issueTypes||[]).filter(t=>/bug|баг|ошиб|дефект/iu.test(t.name));
  if(!tasks&&!bugTypes.length)throw new Error('В проекте не найден тип «Баг». Не буду считать все задачи багами.');
  const field=tasks?'fixVersion':/исправлен|исправления|fixversion/iu.test(command)?'fixVersion':/затронут|affected/iu.test(command)?'affectedVersion':topic.versionField||'affectedVersion';topic.versionField=field;
  const jql=`project ${everywhere?'IN ('+projects.map(p=>quote(p.key)).join(',')+')':'= '+quote(project.key)} ${tasks?'':'AND issuetype IN ('+bugTypes.map(t=>quote(t.id)).join(',')+') '}${version?'AND '+field+' = '+quote(version.id):''}${personal?' AND assignee = currentUser()'+(personalFilter?.category?' AND statusCategory = '+quote(personalFilter.category):personalFilter?.name?' AND status = '+quote(personalFilter.name):personalStatus==='open'?' AND statusCategory != Done':personalStatus==='done'?' AND statusCategory = Done':'')+(personalOverdue?' AND duedate < startOfDay()':''):''} ORDER BY key ASC`;
  let token;const issues=new Map(),seen=new Set();
  for(let page=0;page<100;page++){
   const result=await api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['summary','status','priority','assignee','duedate','updated','issuelinks'],...token?{nextPageToken:token}:{}})},s);
   if(!result||!Array.isArray(result.issues)||result.isLast!==undefined&&typeof result.isLast!=='boolean'||result.nextPageToken!==undefined&&result.nextPageToken!==null&&typeof result.nextPageToken!=='string')throw Error('Jira вернула неполную страницу. Точный отчёт не составлен.');
   for(const issue of result.issues){
    if(!issue||typeof issue.key!=='string'||!new RegExp('^(?:'+(everywhere?projects.map(p=>p.key):[project.key]).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')-[0-9]+$','i').test(issue.key)||!issue.fields||typeof issue.fields!=='object'||Array.isArray(issue.fields))throw Error('Jira вернула карточку без данных или из другого проекта. Отчёт не составлен.');
    if(personal&&(typeof issue.fields.summary!=='string'||typeof issue.fields.status?.name!=='string'||issue.fields.assignee?.accountId!==account.accountId||!['new','indeterminate','done'].includes(issue.fields.status?.statusCategory?.key)||personalStatus==='open'&&issue.fields.status.statusCategory.key==='done'||personalStatus==='done'&&issue.fields.status.statusCategory.key!=='done'||personalFilter?.category&&issue.fields.status.statusCategory.key!==({'To Do':'new','In Progress':'indeterminate'})[personalFilter.category]||personalFilter?.name&&issue.fields.status.name.toLowerCase()!==personalFilter.name.toLowerCase()))throw Error('Jira вернула задачи другого исполнителя или неподходящего статуса. Личный список не составлен.');
    if(personalOverdue&&(!require('./verified-work-report.cjs').validDate(issue.fields.duedate)||issue.fields.duedate>=dueDay))throw Error('Jira вернула задачу вне выбранного срока. Список не составлен.');
    const previous=issues.get(issue.key);
    if(previous&&JSON.stringify(evidenceIssue(previous))!==JSON.stringify(evidenceIssue(issue)))throw Error('Карточка Jira изменилась между страницами. Повторите чтение для согласованного подсчёта.');
    issues.set(issue.key,issue);
   }
   if(result.isLast===false&&!result.nextPageToken?.trim())throw Error('Jira не вернула следующую страницу. Частичный список не считается полным.');
   if(result.isLast===true||!result.nextPageToken){token=null;break;}
   if(seen.has(result.nextPageToken))throw new Error('Jira повторила страницу результатов; точный подсчёт недоступен.');
   seen.add(result.nextPageToken);token=result.nextPageToken;
  }
  check();
  if(token)throw new Error('Больше 10 000 результатов: сузьте запрос, чтобы получить точное число.');
  const rows=[...issues.values()],open=rows.filter(i=>['new','indeterminate'].includes(i.fields?.status?.statusCategory?.key)).length;
  const byPriority={};for(const issue of rows){const name=issue.fields?.priority?.name||'Без приоритета';byPriority[name]=(byPriority[name]||0)+1;}
  const priorityText=rows.length&&/критич|приоритет|блокир/iu.test(command)?' По приоритетам: '+Object.entries(byPriority).map(([k,v])=>k+' — '+v).join(', ')+'.':'';
  if(personal)return {text:'Аккаунт Jira: '+(account.displayName||account.accountId)+'. '+(everywhere?'Проекты: ':'Проект: ')+project.name+'. '+(personalOverdue?'Просроченные':personalStatus==='open'?'Незавершённые':personalStatus==='done'?'Завершённые':'Все')+' назначенные задачи'+(personalFilter?.category||personalFilter?.name?' в статусе «'+(personalFilter.category||personalFilter.name)+'»':'')+': '+rows.length+'.'+(rows.length?'\n'+rows.slice(0,20).map(i=>i.key+' — '+i.fields.summary+' ('+i.fields.status.name+')'+(i.fields.duedate?' · срок '+i.fields.duedate:'')).join('\n'):'')+(rows.length>20?'\nПоказаны первые 20; полный список по ссылке Jira.':'')+'\nПроверено сейчас; только задачи этого аккаунта в выбранном проекте.',sources:[{title:'Мои задачи Jira',url:s.jiraUrl+'/issues/?jql='+encodeURIComponent(jql)}],data:{project:project.key,total:rows.length,open,at:Date.now(),assignee:{accountId:account.accountId,displayName:account.displayName},scope:{assignee:'currentUser',status:personalStatus,overdue:personalOverdue,accessibleOnly:true,completedPagination:true},issues:rows.slice(0,20).map(evidenceIssue)},title:'Мои задачи · '+project.name};
  if(tasks)return {...options.reportRows?{reportRows:rows.map(evidenceIssue)}:{},text:`${project.name}${version?', версия '+version.name:''}: найдено ${rows.length} задач всех типов, незавершённых — ${open}.`+(rows.length?'\n'+[...rows].sort((a,b)=>Number(a.fields?.status?.statusCategory?.key==='done')-Number(b.fields?.status?.statusCategory?.key==='done')).slice(0,20).map(i=>i.key+' — '+i.fields?.summary+(i.fields?.status?.name?' ('+i.fields.status.name+')':'')).join('\n'):'')+(rows.length>20?'\nПоказаны первые 20. Остальные — по ссылке Jira.':'')+(version?' Версия отобрана по полю «Исправить в версиях».':'')+' Проверено сейчас.',sources:[{title:'Задачи Jira',url:s.jiraUrl+'/issues/?jql='+encodeURIComponent(jql)}],data:{scope:{accessibleOnly:true,completedPagination:true,atomicSnapshot:false},...(options.wholeProject?{aggregate:require('./work-skills.cjs').aggregate(rows),detailsTruncated:rows.length>20}:{}),project:project.key,version:version?.name,total:rows.length,open,field:version?field:null,at:Date.now(),issues:rows.slice(0,20).map(evidenceIssue)},title:`Задачи · ${project.name}`};
  // No open bugs in the chosen version: also say how many open bugs the project has without a version,
  // so «Какие баги открыты в BW?» is not answered with a bare zero.
  let elsewhere='';
  if(!tasks&&version&&!open&&!options.reportRows){try{
   const jqlAll=`project = ${quote(project.key)} AND issuetype IN (${bugTypes.map(t=>quote(t.id)).join(',')}) AND statusCategory != Done ORDER BY updated DESC`;
   const page=await api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:jqlAll,maxResults:100,fields:['summary','status']})},s);
   const found=(page?.issues||[]).filter(x=>typeof x?.key==='string'&&x.key.startsWith(project.key+'-'));
   let total=page?.isLast!==false&&!page?.nextPageToken?String(found.length):'';
   if(!total){try{const c=await api('/rest/api/3/search/approximate-count',{method:'POST',body:JSON.stringify({jql:jqlAll})},s);if(Number.isInteger(c?.count))total='около '+c.count;}catch{}}
   if(!total)total='больше 100';
   elsewhere=found.length?'\nВсего открытых багов в '+project.name+' без привязки к версии — '+total+'. Последние обновлённые:\n'+found.slice(0,5).map(x=>x.key+' — '+x.fields?.summary+(x.fields?.status?.name?' ('+x.fields.status.name+')':'')).join('\n'):'\nОткрытых багов в '+project.name+' нет и без привязки к версии.';
  }catch(e){elsewhere='';}}
  return {text:`${project.name}, версия ${version.name}: найдено ${rows.length} багов, из них незавершённых — ${open}.${priorityText} Считал по полю «${field==='affectedVersion'?'Затронутые версии':'Исправить в версиях'}». Проверено сейчас; учитываются доступные твоему аккаунту задачи.${elsewhere}`,sources:[{title:'Результаты Jira',url:s.jiraUrl+'/issues/?jql='+encodeURIComponent(jql)}],data:{project:project.key,version:version.name,total:rows.length,open,byPriority,field,at:Date.now(),issues:rows.slice(0,20).map(evidenceIssue)},title:`Баги · ${project.name}`};
 }
}
module.exports={JiraInsights};
