// Jira's chat reader: bugs of a project version or the project's tasks (src/extensions/jira/insights.cjs), in the
// project the chat is bound to through the project memory when the request names none.
const {keys}=require('./selection.cjs');
const readers=new WeakMap();
function insights(workspace){
 let reader=readers.get(workspace);
 if(!reader){reader=new (require('./insights.cjs').JiraInsights)(workspace);readers.set(workspace,reader);}
 return reader;
}
function read(s,command,topic,context,kind){
 const settings=s.settings,binding=s.projectMemory?.get(topic.projectMemoryId)?.jira;
 if(!topic.jiraProject&&binding?.site===settings.jiraUrl&&keys(settings.jiraProjects||settings.jiraProject).includes(binding.key))topic.jiraProject=binding.key;
 return insights(s.workspace).read(command,topic,context,kind);
}
module.exports={read,insights};
