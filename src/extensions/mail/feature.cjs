// «Почта»: letters as cards (mail-cards.js, result.cjs) and the mail rules (rules.cjs) — «Научись проверять почту»
// in the chat, «Что там в почте» by a saved rule, and the «Почтовые правила» tab on «Навыки» (mail-rules.js). The app
// is the mail service module: it is added with «Почта» in the catalog (module_gmail) and owns the mail connection —
// the Google and Microsoft accounts it reads (connection.cjs, accounts.cjs, gmail.cjs, outlook.cjs; the settings card
// settings.js), which other apps sign in through as `services.mailAccounts`. In the chat it answers mail rules
// (chat-route.cjs), the tool router's «mail» (route-tool.cjs) and adds the closing line of the daily summary
// (summary-section.cjs). Read-only: nothing is sent, deleted or marked read.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const rules=require('./rules.cjs');
const connection=require('./connection.cjs');
const BY='Почта';
const added=s=>s?.settings?.module_gmail==='true'&&(typeof s.modules?.enabled!=='function'||s.modules.enabled(s.settings,'gmail'));
const instances=new Map();

function setup(s){
 // The accounts exist whether or not «Почта» is added: Calendar and the Google apps sign in through them; reading
 // mail checks the module (Gmail/Outlook `check()`).
 const {accounts:mailAccounts,ipc:accountIpc}=connection.create(s);
 const file=s.dataRoot?path.join(s.dataRoot,'extensions','mail','rules.json'):null;
 // The local model reads the letters and drafts the rules; without it the letters are listed as they are.
 const model=async(system,data,format)=>{
  if(!s.settings.model)throw Error('Настройте локальную модель Ollama.');
  const response=await s.request(s.core.localEndpoint(s.settings.ollamaUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:s.settings.model,stream:false,think:false,...format?{format}:{},options:{num_predict:1800},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(data)}]})});
  const content=response.message?.content||'';return format?JSON.parse(content):content;
 };
 const engine=new rules.MailRules({store:rules.store(file),gmail:{read:recipe=>mailAccounts.read(recipe),accounts:()=>mailAccounts.accounts()},model});
 instances.set(s.companyId,engine);
 // Rules Petya's core kept before 0.16 move here once (migrate.cjs).
 try{require('./migrate.cjs').migrate(s,engine);}catch(e){console.error('Mail rules migration:',e.message);}
 // An answer about mail goes to the «Почта Gmail» chat, as it always did.
 function place(command,result){
  const d=s.dialogue;
  if(result.mail||result.mailTeaching){d.prune();let topic=d.state.topics.find(t=>t.mail);if(!topic){topic={id:randomUUID(),title:'Почта Gmail',kind:'chat',mail:true,messages:[],at:Date.now()};d.state.topics.push(topic);}d.state.activeId=topic.id;}
  d.rememberAction(command,result.text);const topic=d.active();return {...result,by:result.by||BY,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
 }
 const accounts=()=>{try{return mailAccounts.accounts().map(a=>({id:a.id,name:a.name,provider:a.provider}));}catch{return [];}};
 const view=()=>({rules:engine.list(),draft:engine.draft(),accounts:accounts(),added:added(s)});
 const mail={
  // The rules while the app is added (the chat router and «Развитие» read them).
  rules:()=>added(s)?engine.list():[],
  // A chat turn about mail (teaching, a rule's phrase, «проверь почту»), or null. Called by Petya's request pipeline
  // where mail requests always went (after web search and service offers), so the order of handlers stays.
  async turn(command){if(!added(s))return null;const result=await engine.turn(command);return result?place(command,result):null;},
  // The chat router picked a rule by its id.
  async run(id,command){
   if(!added(s))return null;
   const rule=engine.list().find(r=>r.id===id&&r.enabled);
   if(!rule)return {handled:true,question:true,text:'Каким почтовым правилом проверить почту? Их список — на «Навыки» → «Почтовые правила».'};
   const result=await engine.run(rule);s.dialogue.rememberAction(command,result.text);return result;
  }
 };
 const id=v=>{if(typeof v!=='string'||!v||v.length>100)throw Error('Некорректное правило.');return v;};
 const ipc={
  list:view,
  save(input){if(!input||typeof input!=='object')throw Error('Некорректное правило.');engine.put(input);engine.setDraft(null);return view();},
  remove(rule){const removed=engine.remove(id(rule));return {...view(),removed};},
  restore(rule){if(!rule||typeof rule!=='object')throw Error('Некорректное правило.');engine.restore(rule);return view();},
  toggle(rule,on){const found=engine.list().find(r=>r.id===id(rule));if(!found)throw Error('Это правило уже удалено.');engine.put({...found,enabled:!!on});return view();},
  dropDraft(){engine.setDraft(null);return view();},
  async test(input){if(!input||typeof input!=='object')throw Error('Некорректное правило.');const r=await engine.run(input);return {text:r.text,error:!!r.error};},
  ...accountIpc
 };
 stopAccounts=()=>mailAccounts.stop();
 try{require('electron').app?.on?.('will-quit',stopAccounts);}catch{}
 // `mailAccounts` keeps the name the other apps have always read (Calendar, Google Диск, Google Таблицы, «Поиск по
 // всему», a meeting service's summary letters), so none of them changes; `mail` is the app's own service.
 return {ipc,mail,mailAccounts};
}
let stopAccounts=()=>{};
const {defaults,secrets,limits,publicFlags,validate}=connection.settings;
module.exports={name:'mail',defaults,secrets,limits,publicFlags,validate,setup,teardown(){stopAccounts();},instance:company=>company?instances.get(company):[...instances.values()].at(-1)};
