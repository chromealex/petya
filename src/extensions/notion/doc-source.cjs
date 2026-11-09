// Notion as a documentation source of the task decomposition (doc-source, src/features/doc-sources.cjs): pages found
// by title (Notion's search reads titles), each with the start of its text; a long page chosen for the plan is read in
// full. Moved from Petya's core (src/workspace.cjs). Requests go through Petya's client, which signs api.notion.com
// with the browser sign-in (`notionCredential`) when there is one, otherwise the token (`notionToken`) is sent here.
const {Notion}=require('./client.cjs');
// One client per request function: the client spaces its calls (Notion allows about three a second).
const clients=new WeakMap();
const client=request=>{if(!clients.has(request))clients.set(request,new Notion((...args)=>request(...args)));return clients.get(request);};
module.exports={
 id:'notion',name:'Notion',
 ready:settings=>settings.module_notion!=='false'&&!!(settings.notionToken||settings.notionCredential),
 watch:['module_notion','notionCredential','notionToken'],
 note:'Notion: поиск по названиям страниц; текст найденных документов используется в плане.',
 search:({settings,request},terms)=>client(request).search(terms,settings.notionToken),
 async full({settings,request},doc){return client(request).content(String(doc.id).replace(/^notion:/,''),settings.notionToken,{full:true});},
 client
};
