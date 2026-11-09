// Search source of «Документы» for «Поиск по всему» (`search-source`, src/extensions/search-all/registry.cjs):
// Confluence and Notion through the shared docs search (s.workspace.searchDocs) — one request, two card rows.
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const https=u=>/^https:\/\//.test(String(u||''))?String(u):'';
function connected(settings){
 const confluence=settings.module_confluence!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
 const notion=settings.module_notion!=='false'&&!!(settings.notionToken||settings.notionCredential);
 return {confluence,notion};
}
module.exports={
 id:'docs',label:'Документы',order:20,icon:'doc',
 parts:[{id:'confluence',label:'Confluence'},{id:'notion',label:'Notion'}],
 ready(settings,s){if(!s?.workspace?.searchDocs)return [];const c=connected(settings);return Object.keys(c).filter(k=>c[k]);},
 off:{confluence:'Confluence не подключён.',notion:'Notion не подключён.'},
 async search(s,{own}){
  const r=await s.workspace.searchDocs({title:'',text:''},own.join(' '));
  return {items:(r.docs||[]).slice(0,20).map(d=>({source:String(d.source||'').toLowerCase()==='notion'?'notion':'confluence',id:'doc:'+d.id,title:one(d.title).slice(0,200),text:String(d.text||'').slice(0,8000),
   url:https(d.url),at:Date.parse(d.updated)||0,meta:''})),note:(r.warnings||[]).filter(w=>!/используется в плане/.test(w)).join(' ')};
 },
 connected
};
