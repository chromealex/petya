// Search source of Jira for «Поиск по всему» (`search-source`, src/extensions/search-all/registry.cjs): issues whose
// text mentions the words (JQL `text ~`, POST /rest/api/3/search/jql) in the projects chosen in Jira settings.
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const connected=settings=>settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
// Jira's document format → plain text (paragraphs, lists, code).
function adfText(node,depth=0){
 if(!node||depth>30)return '';
 if(typeof node==='string')return node;
 if(node.type==='text')return node.text||'';
 const inner=(node.content||[]).map(n=>adfText(n,depth+1)).join(node.type==='paragraph'||node.type==='heading'?'':' ');
 return ['paragraph','heading','listItem','codeBlock','blockquote'].includes(node.type)?inner+'\n':inner;
}
module.exports={
 id:'jira',label:'Jira',order:40,icon:'task',
 ready:(settings,s)=>!!s?.workspace?.api&&connected(settings),
 off:'Jira не подключена.',
 async search(s,{words}){
  const settings={...s.workspace.settings()};
  const keys=String(settings.jiraProjects||settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));
  const clean=[...new Set(words.map(w=>String(w).replace(/[^\p{L}\p{N}_]/gu,'')).filter(w=>w.length>=2))].slice(0,6);
  if(!clean.length)return {items:[]};
  const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
  const jql=(keys.length?'project IN ('+keys.map(quote).join(',')+') AND ':'')+'('+clean.map(w=>'text ~ '+quote(/^[а-яё]+$/iu.test(w)&&w.length>=4?w+'*':w)).join(' OR ')+') ORDER BY updated DESC';
  const data=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:25,fields:['summary','status','updated','description','issuetype']})},settings);
  if(!Array.isArray(data?.issues))throw Error('Jira вернула неизвестный ответ на поиск.');
  const site=String(settings.jiraUrl||'').replace(/\/+$/,'');
  return {items:data.issues.map(i=>{const f=i.fields||{};return {source:'jira',id:'jira:'+i.key,title:(i.key?i.key+' · ':'')+one(f.summary).slice(0,200),text:adfText(f.description).slice(0,6000),
   url:site&&/^[A-Z][A-Z0-9_]*-\d+$/.test(i.key)?site+'/browse/'+i.key:'',at:Date.parse(f.updated)||0,meta:[one(f.issuetype?.name),one(f.status?.name)].filter(Boolean).join(' · ')};}),link:site?site+'/issues/?jql='+encodeURIComponent(jql):''};
 },
 adfText
};
