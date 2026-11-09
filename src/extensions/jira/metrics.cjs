const {allowed}=require('./routing.cjs');
const {members}=require('../../team.cjs');
const quote=s=>'"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function summarize(issues,logs,done,since,ids,known){
 const selected=new Set(ids),closed=new Set(),reopened=new Set();let open=0;
 for(const issue of issues){if(!selected.has(issue.fields?.assignee?.accountId))continue;if(issue.fields.status?.statusCategory?.key!=='done')open++;
 for(const event of logs.get(issue.key)||[]){if(Date.parse(event.created)<since)continue;for(const item of event.items||[]){if(item.field!=='status'||known&&(!known.has(String(item.from))||!known.has(String(item.to))))continue;if(!done.has(String(item.from))&&done.has(String(item.to)))closed.add(issue.key);if(done.has(String(item.from))&&!done.has(String(item.to)))reopened.add(issue.key);}}
 }
 return {closed:closed.size,reopened:reopened.size,open};
}
async function read(workspace,{days=30,project=''}={},now=Date.now()){
 if(![7,30,90].includes(days))throw Error('Выберите период 7, 30 или 90 дней.');
 const settings={...workspace.settings()},projects=allowed(settings);if(settings.module_jira==='false'||!projects.length)throw Error('Подключите Jira и выберите доступные проекты в настройках.');if(project&&!projects.includes(project))throw Error('Проект недоступен в текущей компании.');
 const fingerprint=s=>JSON.stringify([s.jiraUrl,s.jiraProjects,s.jiraProject,s.jiraToken,s.jiraEmail,s.atlassianCredential,s.teamMembers,s.module_jira]);
 const api=async(path,options={})=>{if(fingerprint(settings)!==fingerprint(workspace.settings()))throw Error('Компания, команда или подключение изменились. Обновите статистику.');const value=await workspace.api(path,options,settings);if(fingerprint(settings)!==fingerprint(workspace.settings()))throw Error('Подключение изменилось. Обновите статистику.');return value;};
 const me=await api('/rest/api/3/myself');if(!me.accountId)throw Error('Jira не вернула ваш аккаунт.');const people=members(settings),linked=people.filter(p=>p.jiraId),missing=people.filter(p=>!p.jiraId).map(p=>p.name),ids=[...new Set([me.accountId,...linked.map(p=>p.jiraId)])];
 const scope=project?[project]:projects,done=new Set(),known=new Set();
 for(const key of scope){const types=await api('/rest/api/3/project/'+encodeURIComponent(key)+'/statuses');if(!Array.isArray(types))throw Error('Не удалось определить завершённые статусы Jira.');for(const type of types)for(const status of type.statuses||[]){known.add(String(status.id));if(status.statusCategory?.key==='done')done.add(String(status.id));}}
 if(!done.size)throw Error('В выбранных проектах не найдены завершённые статусы.');
 const jql='project IN ('+scope.map(quote).join(',')+') AND assignee IN ('+ids.map(quote).join(',')+') AND (updated >= -'+days+'d OR statusCategory != Done) ORDER BY updated DESC';
 const issues=[],seen=new Set();let token,partial=false;
 for(let page=0;page<10;page++){const data=await api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,fields:['assignee','status','updated'],maxResults:100,...token?{nextPageToken:token}:{}})});if(!Array.isArray(data.issues))throw Error('Jira вернула неполный список задач.');issues.push(...data.issues);if(data.isLast===true||(!data.nextPageToken&&data.isLast!==false))break;if(!data.nextPageToken||seen.has(data.nextPageToken))throw Error('Не удалось загрузить следующую страницу задач.');seen.add(data.nextPageToken);token=data.nextPageToken;if(page===9)partial=true;}
 const unique=[...new Map(issues.map(i=>[i.key,i])).values()],since=now-days*86400000,logs=new Map(),recent=unique.filter(i=>Date.parse(i.fields.updated)>=since);if(recent.length>300)partial=true;const queue=recent.slice(0,300);
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const issue=queue.shift(),rows=[];let startAt=0;for(let page=0;page<20;page++){const data=await api('/rest/api/3/issue/'+encodeURIComponent(issue.key)+'/changelog?startAt='+startAt+'&maxResults=100');if(!Array.isArray(data.values))throw Error('Нет доступа к истории изменений задачи '+issue.key+'.');rows.push(...data.values);startAt+=data.values.length;if(data.isLast===true||Number.isFinite(data.total)&&startAt>=data.total)break;if(!data.values.length)throw Error('Jira вернула неполную историю '+issue.key+'.');if(page===19)partial=true;}if(rows.some(e=>Date.parse(e.created)>=since&&(e.items||[]).some(i=>i.field==='status'&&(!known.has(String(i.from))||!known.has(String(i.to))))))partial=true;logs.set(issue.key,rows);}}));
 return {at:now,days,project,projects,personal:summarize(unique,logs,done,since,[me.accountId],known),team:linked.length?summarize(unique,logs,done,since,linked.map(p=>p.jiraId),known):null,linked:linked.length,total:people.length,missing,partial,issueCount:unique.length,person:me.displayName||'Вы'};
}
module.exports={read,summarize};
