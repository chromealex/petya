// Journal source: Jira. Status changes made by the user in the period (JQL `status CHANGED BY currentUser() DURING`,
// then the issue changelog for the exact moment and the from → to statuses) and, as candidates for tomorrow, the
// user's open tasks due by the end of tomorrow. Read through Petya's Jira connection (REST v3: /myself and
// POST /search/jql); nothing is written.
const modules=require('../../modules.cjs');
const pad=v=>String(v).padStart(2,'0');
const jqlDate=ms=>{const d=new Date(ms);return d.getFullYear()+'/'+pad(d.getMonth()+1)+'/'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
const ymd=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
module.exports={
 id:'jira',name:'Jira',icon:'task',
 ready:s=>modules.enabled(s,'jira')&&!!s.jiraUrl&&!!(s.atlassianCredential||s.jiraEmail&&s.jiraToken),
 async collect(s,{from,to,now=Date.now()}){
  const settings=s.workspace.settings();
  const api=(route,options)=>s.workspace.api(route,options,settings);
  const browse=key=>{try{return new URL('/browse/'+encodeURIComponent(key),settings.jiraUrl||s.settings.jiraUrl).href;}catch{return '';}};
  const me=(await api('/rest/api/3/myself'))?.accountId||'';
  const search=body=>api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify(body)});
  const changed=await search({jql:'status CHANGED BY currentUser() DURING ("'+jqlDate(from)+'", "'+jqlDate(to)+'") ORDER BY updated DESC',fields:['summary','status'],expand:'changelog',maxResults:50});
  const items=[];
  for(const issue of changed?.issues||[]){
   for(const h of issue.changelog?.histories||[]){
    const at=Date.parse(h.created);if(!(at>=from&&at<to)||me&&h.author?.accountId&&h.author.accountId!==me)continue;
    for(const it of h.items||[])if(it.field==='status')items.push({at,icon:'task',kind:'transition',title:issue.key+' '+String(issue.fields?.summary||'').slice(0,160),detail:(it.fromString||'?')+' → '+(it.toString||'?'),url:browse(issue.key)});
   }
  }
  const end=new Date(now);end.setDate(end.getDate()+1);
  const due=await search({jql:'assignee = currentUser() AND statusCategory != Done AND duedate <= "'+ymd(end.getTime())+'" ORDER BY duedate ASC',fields:['summary','duedate','status'],maxResults:20});
  const carry=(due?.issues||[]).map(i=>({id:'jira:'+i.key,title:i.key+' '+String(i.fields?.summary||'').slice(0,160),detail:'срок '+String(i.fields?.duedate||'')+(i.fields?.status?.name?' · '+i.fields.status.name:''),url:browse(i.key),source:'jira'}));
  return {items,carry};
 }
};
