// Jira on dashboards: issues by JQL, refreshed by themselves (src/features/dashboards.cjs). The phrase «баги
// спринта», «мои задачи в работе», «закрыто за неделю» becomes JQL limited to the projects of the connection.
const {allowed}=require('./routing.cjs');
const FIELDS='summary,status,assignee,priority,issuetype,duedate';
const ABOUT=/(?:^|[^\p{L}])(?:jira|д?жир\p{L}*|задач\p{L}*|таск\p{L}*|баг\p{L}*|тикет\p{L}*|спринт\p{L}*|эпик\p{L}*|issues?|bugs?|tasks?)(?=$|[^\p{L}])/iu;
const WRITE=/(?:^|[^\p{L}])(?:созда\p{L}*|заведи|удали\p{L}*|перенеси|назначь|закрой|поменяй|измени\p{L}*)(?=$|[^\p{L}])/iu;
const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
// The phrase → JQL. Returns '' when the phrase is not about Jira issues.
function jqlFor(phrase,projects=[]){
  const t=String(phrase||'');
  const raw=t.match(/(?:^|\s)jql\s*[:=]\s*(.+)$/iu);if(raw)return raw[1].trim();
  if(!ABOUT.test(t)||WRITE.test(t))return '';
  const where=[];
  if(projects.length)where.push('project IN ('+projects.map(quote).join(', ')+')');
  if(/баг|bug|ошибк/iu.test(t))where.push('issuetype = Bug');
  if(/спринт|sprint/iu.test(t))where.push('sprint in openSprints()');
  if(/(?:^|[^\p{L}])(?:мо[иеёя]\p{L}*|на мне|мне назнач\p{L}*|my)(?=$|[^\p{L}])/iu.test(t))where.push('assignee = currentUser()');
  if(/без исполнител|не назначен|unassigned/iu.test(t))where.push('assignee is EMPTY');
  const closed=/закрыт|сделан|выполнен|решён|решен|done|resolved/iu.test(t);
  if(closed){const days=/месяц/iu.test(t)?30:/сегодня/iu.test(t)?1:7;where.push('statusCategory = Done','resolved >= -'+days+'d');}
  else if(/в работе|in progress/iu.test(t))where.push('statusCategory = "In Progress"');
  else if(/завис|застрял|без движени/iu.test(t))where.push('statusCategory = "In Progress"','updated <= -7d');
  else where.push('statusCategory != Done');
  if(/блокер|blocker|критич|critical|срочн/iu.test(t))where.push('priority in (Highest, High)');
  return where.join(' AND ')+' ORDER BY '+(closed?'resolved DESC':/баг|bug/iu.test(t)?'priority DESC, updated DESC':'updated DESC');
}
function titleFor(phrase){const t=String(phrase||'').trim();return t?t[0].toUpperCase()+t.slice(1,80):'Задачи Jira';}
function connected(s){try{return require('../../service-access.cjs').ready('jira',s.settings)&&!!s.settings.jiraUrl;}catch{return false;}}
function projectsOf(s,topic){
  const keys=allowed(s.settings),binding=s.projectMemory?.get(topic?.projectMemoryId)?.jira;
  const bound=topic?.jiraProject||(binding&&s.settings.jiraUrl&&binding.site===s.settings.jiraUrl&&binding.key);
  return bound&&keys.includes(bound)?[bound]:keys;
}
// Issues for the widget, in the shape the Jira cards draw (message.jiraItems).
async function load(s,{jql},topic){
  if(!connected(s))throw Error('Jira не подключена. Откройте Подключения → Jira.');
  s.modules?.assertEnabled?.(s.settings,'jira');
  const site=new URL(s.settings.jiraUrl).origin;
  const params=new URLSearchParams({jql,fields:FIELDS,maxResults:'50'});
  const page=await s.workspace.api('/rest/api/3/search/jql?'+params,{},s.workspace.settings());
  if(!Array.isArray(page?.issues))throw Error('Jira вернула неполный ответ.');
  const items=page.issues.filter(i=>/^[A-Z][A-Z0-9_]*-\d+$/u.test(i.key)).map(i=>({key:i.key,site,summary:String(i.fields?.summary||i.key).slice(0,300),
    status:i.fields?.status?.name||'',category:i.fields?.status?.statusCategory?.key||'',assignee:i.fields?.assignee?.displayName||'',
    priority:i.fields?.priority?.name||'',type:i.fields?.issuetype?.name||'',due:i.fields?.duedate||''}));
  const more=page.isLast===false||!!page.nextPageToken;
  return {data:{jiraItems:items},text:items.length?items.length+(more?'+':'')+' '+(items.length%10===1&&items.length%100!==11?'задача':items.length%10>=2&&items.length%10<=4&&(items.length%100<10||items.length%100>=20)?'задачи':'задач'):'Задач нет',count:items.length,more};
}
const presets=[
  {title:'Мои задачи в работе',phrase:'мои задачи в работе'},
  {title:'Открытые баги',phrase:'открытые баги'},
  {title:'Задачи спринта',phrase:'задачи спринта'},
  {title:'Закрыто за неделю',phrase:'задачи закрытые за неделю'},
  {title:'Зависшие задачи',phrase:'зависшие задачи'}
];
module.exports={jqlFor,titleFor,load,connected,projectsOf,presets,ABOUT};
