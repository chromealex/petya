const {AsyncLocalStorage}=require('node:async_hooks');
const scope=new AsyncLocalStorage();
const operations=new Set(['converse','attachmentInspect','plan','draft','prepareBatch','webSearchContinue','dailyBrief','skillsContinue','serviceBrowserRead']);
function run(name,emit,work){return operations.has(name)?scope.run(emit,work):work();}
function report(label){scope.getStore()?.(label);}
function request(url,service){
 const names={jira:'Jira',slack:'Slack',notion:'Notion',asana:'Asana',confluence:'Confluence',gmail:'почте',telegram:'Telegram',googleplay:'Google Play Console'};
 if(names[service])report('Обращаюсь к '+names[service]);
 else{try{const host=new URL(url).hostname;if(['localhost','127.0.0.1','[::1]'].includes(host))report('Обрабатываю запрос локальной моделью');}catch{}}
}
module.exports={run,report,request};
