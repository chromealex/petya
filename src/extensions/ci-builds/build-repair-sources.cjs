const {adfText}=require('../../history.cjs');
const {adf}=require('../../core.cjs');
const {allowed}=require('../jira/routing.cjs');
const {threadURL,downloadLog,excerpt}=require('../../slack-log.cjs');
const failure=/(?:билд|сборк|build)[\s\S]{0,120}(?:пада|упал|не работа|не собира|failed|broken)|(?:пада|не работа)[\s\S]{0,80}(?:билд|сборк|build)/iu;
const hasLog=text=>/(?:error\s*[:\[]\s*\S.{8}|fatal\s*:\s*\S.{8}|exception\s*:\s*\S.{8}|Caused by:\s*\S.{8}|Cannot find module\s+\S|error [A-Z]+\d+:|undefined reference to|No such file or directory)/iu.test(text||'');
const logFile=f=>/\.(?:log|txt|out)$/iu.test(f.name||f.filename||'');
function slackLocation(url){const u=new URL(threadURL(url)||'invalid'),p=u.pathname.split('/'),s=p[3].slice(1);return {channel:p[2],ts:s.slice(0,-6)+'.'+s.slice(-6)};}
class RepairSources{
 constructor({workspace,slack,settings,jiraDownload,slackToken}){Object.assign(this,{workspace,slack,settings,jiraDownload,slackToken});}
 async read(source){
 if(source.kind==='local')return {title:source.title,url:'',text:source.text,logs:hasLog(source.text)?[{name:'Приложенный лог',text:excerpt(source.text)}]:[],notes:[]};
 if(source.kind==='jira'){
 const s=this.settings();if(s.module_jira==='false')throw Error('Включите модуль Jira.');if(source.site!==s.jiraUrl)throw Error('Подключение Jira изменилось.');if(!allowed(s).includes(source.key.split('-')[0]))throw Error('Добавьте проект задачи в доступные проекты Jira.');
 const issue=await this.workspace.api('/rest/api/3/issue/'+source.key+'?fields=summary,description,reporter,creator,project,attachment');
 let comments=[],startAt=0;for(let page=0;page<10;page++){const data=await this.workspace.api('/rest/api/3/issue/'+source.key+'/comment?'+new URLSearchParams({startAt,maxResults:100,orderBy:'-created'}));comments.push(...data.comments||[]);startAt+=(data.comments||[]).length;if(startAt>=data.total||!(data.comments||[]).length)break;if(page===9)throw Error('В задаче слишком много комментариев: уточните лог.');}
 const rows=comments.map(c=>({text:adfText(c.body),author:c.author,at:Date.parse(c.created),id:c.id})).sort((a,b)=>b.at-a.at);const description=adfText(issue.fields.description);const report=rows.find(c=>failure.test(c.text));const author=report?.author||issue.fields.reporter||issue.fields.creator;
 const logs=[{name:'Описание '+source.key,text:description},...rows.map(c=>({name:'Комментарий '+c.id,text:c.text}))].filter(a=>hasLog(a.text)).slice(0,5).map(a=>({...a,text:excerpt(a.text)}));const notes=[];
 for(const file of (issue.fields.attachment||[]).filter(logFile).sort((a,b)=>Date.parse(b.created)-Date.parse(a.created)).slice(0,3))try{const text=await this.jiraDownload(file);if(hasLog(text))logs.push({name:file.filename,text:excerpt(text)});}catch(e){notes.push(file.filename+': '+e.message);}
 return {title:issue.fields.summary,project:issue.fields.project?.key||source.key.split('-')[0],url:s.jiraUrl+'/browse/'+source.key,text:[description,...rows.slice(0,20).map(c=>c.text)].join('\n').slice(0,30000),logs,notes,author:author?.accountId?{id:author.accountId,name:author.displayName}:null};
 }
 if(this.settings().module_slack==='false')throw Error('Включите модуль Slack.');const loc=slackLocation(source.url);let messages=[],cursor='',seen=new Set();for(let page=0;page<10;page++){const data=await this.slack().api('conversations.replies',{...loc,limit:'100',...cursor?{cursor}:{}});messages.push(...data.messages||[]);cursor=(data.response_metadata?.next_cursor||'').trim();if(data.has_more&&!cursor)throw Error('Тред Slack загружен не полностью.');if(!cursor)break;if(seen.has(cursor)||page===9)throw Error('Не удалось полностью прочитать тред.');seen.add(cursor);}
 const report=messages.filter(m=>m.user&&!m.bot_id&&failure.test(m.text||'')).sort((a,b)=>Number(b.ts)-Number(a.ts))[0];const logs=messages.filter(m=>hasLog(m.text)).slice(-5).map(m=>({name:'Сообщение Slack '+m.ts,text:excerpt(m.text)}));const notes=[];
 const files=[...new Map(messages.flatMap(m=>m.files||[]).filter(logFile).map(f=>[f.id,f])).values()].slice(-3);for(const file of files)try{const text=await downloadLog(file,await this.slackToken());if(hasLog(text))logs.push({name:file.name,text});}catch(e){notes.push(file.name+': '+e.message);}
 return {title:'Падающая сборка в Slack',url:source.url,text:messages.map(m=>m.text||'').join('\n').slice(-30000),logs,notes,author:report?{id:report.user}:null};
 }
 async requestLog(source,data,operationId,guard=()=>{}){guard();const message='Чтобы исправить падающую сборку, пришлите, пожалуйста, полный текстовый лог ошибки, номер билда, ветку/коммит и команду сборки. Одного сообщения «build failed» недостаточно.';
 if(source.kind==='jira'){const body=adf(message);if(data.author?.id)body.content[0].content.unshift({type:'mention',attrs:{id:data.author.id,text:data.author.name||'Автор сообщения'}},{type:'text',text:' '});const result=await this.workspace.api('/rest/api/3/issue/'+source.key+'/comment',{method:'POST',body:JSON.stringify({body})});if(!result.id)throw Error('Jira не подтвердила комментарий.');return {kind:'jira',key:source.key,site:source.site,url:data.url+'?focusedCommentId='+result.id};}
 if(source.kind!=='slack'||!data.author)throw Error('Не найден автор сообщения о падении. Укажите задачу Jira или тред с автором, либо прикрепите лог.');
 const user=await this.slack().api('users.info',{user:data.author.id});guard();if(user.user?.id!==data.author.id||user.user.deleted||user.user.is_bot)throw Error('Автор сообщения недоступен в Slack.');const auth=await this.slack().api('auth.test');guard();if(auth.user_id===data.author.id)throw Error('Сообщение о падении написали вы. Прикрепите лог или укажите задачу Jira.');const dm=await this.slack().api('conversations.open',{users:data.author.id},true);guard();if(!/^D[A-Z0-9]+$/.test(dm.channel?.id||''))throw Error('Не удалось открыть личную переписку.');const sent=await this.slack().api('chat.postMessage',{channel:dm.channel.id,text:message+' Контекст: '+source.url,client_msg_id:operationId,unfurl_links:false,unfurl_media:false,parse:'none'},true);if(!/^\d+\.\d+$/.test(sent.ts||'')||sent.channel!==dm.channel.id)throw Error('Slack не подтвердил сообщение.');return {kind:'slack',url:'https://app.slack.com/archives/'+sent.channel+'/p'+sent.ts.replace('.',''),author:data.author.id};
 }
 async report(source,destination,message,operationId,guard=()=>{}){
 guard();
 if(source.kind==='jira'){
  const result=await this.workspace.api('/rest/api/3/issue/'+source.key+'/comment',{method:'POST',body:JSON.stringify({body:adf(message)})});
  if(!result.id)throw Error('Jira не подтвердила публикацию отчёта.');return result;
 }
 const loc=slackLocation(destination?.url||source.url);
 const result=await this.slack().api('chat.postMessage',{channel:loc.channel,thread_ts:loc.ts,text:message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),client_msg_id:operationId,unfurl_links:false,unfurl_media:false,parse:'none'},true);
 if(result.channel!==loc.channel||!/^\d+\.\d+$/.test(result.ts||''))throw Error('Slack не подтвердил публикацию отчёта.');return result;
 }

}
async function jiraLog(file,{settings,workspace,rewrite,fetcher=fetch}){if(!/^\d+$/.test(String(file.id))||!logFile(file)||file.size>2*1024*1024)throw Error('Нужен текстовый лог до 2 МБ.');const s=settings();const route=s.jiraUrl+'/rest/api/3/attachment/content/'+file.id+'?redirect=false';const target=await rewrite(route,{headers:workspace.credentials(s)},s);const url=new URL(target.url);if(url.protocol!=='https:'||![new URL(s.jiraUrl).hostname,'api.atlassian.com'].includes(url.hostname))throw Error('Неверный адрес вложения Jira.');const response=await fetcher(url.href,{...target.options,redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok||/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Лог Jira недоступен (HTTP '+response.status+').');const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>2*1024*1024)throw Error('Лог больше 2 МБ.');chunks.push(Buffer.from(part));}const text=Buffer.concat(chunks).toString('utf8');if(text.includes('\0'))throw Error('Вложение не является текстовым логом.');return excerpt(text);}
module.exports={RepairSources,hasLog,failure,jiraLog};
