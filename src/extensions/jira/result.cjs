// Card quick edits (status, assignee, priority, due date) run through quick.cjs; each returns its undo.
const quick=require('./quick.cjs').actions;
const reports=require('../report-result.cjs')('jira');
function capture(result){
  if(!Array.isArray(result.data?.issues))return;
  const source=result.sources?.find(item=>{try{return new URL(item.url).hostname.endsWith('.atlassian.net');}catch{return false;}});
  if(!source)return;
  const site=new URL(source.url).origin;
  return result.data.issues.filter(item=>/^[A-Z][A-Z0-9_]*-\d+$/u.test(item.key)).map(item=>({
    key:item.key,site,summary:String(item.fields?.summary||item.key).slice(0,300),
    status:item.fields?.status?.name||'',category:item.fields?.status?.statusCategory?.key||'',
    assignee:item.fields?.assignee?.displayName||'',priority:item.fields?.priority?.name||'',type:item.fields?.issuetype?.name||'',due:item.fields?.duedate||''
  }));
}
module.exports={
  id:'jira',capture,
  describe(message,topic,s){
    const tasks=(message.jiraItems||[]).map(item=>({key:[item.site,item.key],item,presentationKey:JSON.stringify([item.site,item.key]),
      title:'Jira · '+item.key,subtitle:item.summary,
      // Editing happens in the card itself (expanded view), not through the composer.
      actions:[{id:'open',label:'Открыть в Jira'},{id:'details',label:'К ответу'},{id:'edit',label:'Изменить',hidden:true},...quick.map(id=>({id,label:id,hidden:true}))]}));
    return [...reports.describe(message,topic,s),...tasks];
  },
  async perform(action,row,s,check,args){
    if(quick.includes(action))return require('./quick.cjs').perform(action,row,s,check,args||{});
    if(action!=='open')throw Error('Неизвестное действие Jira.');
    const item=row.item,scope=require('./desktop-reply.cjs').scope(s,s.dialogue.active());
    const validate=()=>{
      check();s.modules.assertEnabled(s.settings,'jira');
      if(new URL(s.settings.jiraUrl).origin!==item.site||
        !scope.projects.includes(item.key.split('-')[0]))throw Error('Подключение Jira изменилось. Выберите задачу из нового ответа.');
    };
    validate();
    const issue=await scope.searchPage('/rest/api/3/issue/'+encodeURIComponent(item.key)+'?fields=summary');
    validate();
    if(issue.key!==item.key)throw Error('Задача больше недоступна.');
    await require('electron').shell.openExternal(item.site+'/browse/'+encodeURIComponent(item.key));
    return {handled:true,text:'Открыл '+item.key+' в Jira.'};
  }
};
