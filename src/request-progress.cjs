const {AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();
const operations=new Set(['converse','attachmentInspect','plan','draft','prepareBatch','webSearchContinue','dailyBrief','skillsContinue','serviceBrowserRead']);
// Each operation keeps the ordered list of its steps, so the chat can show what Petya did.
function run(name,emit,work){return operations.has(name)?scope.run({emit,steps:[]},work):work();}
function report(label){const s=scope.getStore();if(!s||typeof label!=='string'||!label)return;const last=s.steps.at(-1);if(!s.steps.some(x=>x.label===label)){if(last)last.done=Date.now();if(s.steps.length<40)s.steps.push({label:label.slice(0,160),at:Date.now()});}s.emit(label);}
function steps(){const now=Date.now();return (scope.getStore()?.steps||[]).map(s=>({label:s.label,ms:Math.max(0,(s.done||now)-s.at)}));}
function request(url,service){
 const names={jira:'Jira',slack:'Slack',notion:'Notion',asana:'Asana',confluence:'Confluence',gmail:'почте',telegram:'Telegram',googleplay:'Google Play Console'};
 if(names[service])report('Обращаюсь к '+names[service]);
 else{try{const host=new URL(url).hostname;if(['localhost','127.0.0.1','[::1]'].includes(host))report('Обрабатываю запрос локальной моделью');}catch{}}
}
module.exports={run,report,request,steps};
