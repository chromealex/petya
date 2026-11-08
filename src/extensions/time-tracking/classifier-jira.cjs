// Activity classifier: a Jira issue key in the window title («[BW-123] Магазин падает - Jira», a branch
// «feature/BW-123-shop» in an IDE or Git client) tags the span with that task. With Jira projects chosen in Petya's
// Jira settings only their keys count; otherwise any KEY-123 except common non-issue words (UTF-8, ISO-8601…).
const NOT=/^(?:UTF|ISO|SHA|MD|RFC|CVE|COVID|MP|PS|X|H|GPT|IPV|TLS|SSL|HTTP|DX|GL|ES|AES|RSA|ECMA|IEEE|PCI|USB|HDMI|AM|PM|UTC|GMT|EN|RU|IOS|API|SDK|PEP|JSR|WCAG|TOP|UI|ID|PR)$/;
const KEY=/(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,9})-(\d{1,6})(?![A-Za-z0-9])/g;
module.exports={
 id:'jira-key',name:'Задачи Jira в заголовке',order:10,
 classify({title},settings={}){
  const allowed=String(settings.jiraProjects||settings.jiraProject||'').split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  for(const m of String(title||'').matchAll(KEY)){
   const project=m[1];
   if(allowed.length?!allowed.includes(project):NOT.test(project))continue;
   const task=project+'-'+m[2];
   let url='';try{url=settings.jiraUrl?new URL('/browse/'+task,settings.jiraUrl).href:'';}catch{url='';}
   return {task,category:'work',...url?{url}:{}};
  }
  return null;
 }
};
