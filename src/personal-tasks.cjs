function details(command,topic){
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/^пожалуйста[,\s]+/iu,'');
 if(topic?.taskAssignee==='currentUser'){const follow=text.replace(/^а\s+/iu,'');if(/^(?:обнови(?: ответ| данные)?|проверь ещё|посмотри ещё|только (?:просроченные|закрытые|открытые|незаверш[её]нные)|(?:теперь )?(?:в|по) (?:проект[еу]? )?[A-Z][A-Z0-9_-]*)[.!?]*$/iu.test(follow)){const overdue=/просроч/iu.test(follow)?true:/только (?:закрытые|открытые|незаверш)/iu.test(follow)?false:!!topic.personalTaskOverdue;return {status:/просроч|только (?:открытые|незаверш)/iu.test(follow)?'open':/только закрытые/iu.test(follow)?'done':topic.personalTaskStatus||'open',overdue};}}
 if(/^(?:не\s|[«"“]|если|объясни|переведи|придумай|что такое|что означает)/iu.test(text)||/(?:^|\s)(?:и|а|но|потом|затем)(?:\s|$)/iu.test(text)||/[;\n]/.test(text))return null;
 if(/(?:вчера|завтра|сегодня|недел|asana|асана|асане|notion|trello)/iu.test(text))return null;
 const suffix='(?:\\s+(?:в|по)\\s+[^.!?]+)?[.!?]*';
 const status='(?:(?:все|просроченные|открытые|незаверш[её]нные|закрытые|заверш[её]нные)\\s+)?';
 const noun='(?:задачи|таски)';
 const possessive=new RegExp('^(?:(?:покажи|перечисли|проверь|какие|список)\\s+)?'+status+'(?:мои\\s+'+status+noun+'|'+noun+'(?:,)?\\s+(?:на мне|назначенные мне|назначены на меня|у меня))'+suffix+'$','iu');
 const indirect=new RegExp('^(?:список моих задач|какие из моих задач завершены|(?:какие\\s+)?у меня задачи|что (?:(?:сейчас )?висит на мне|на мне|у меня в работе|назначено мне|мне назначено))'+suffix+'$','iu');
 if(!possessive.test(text)&&!indirect.test(text))return null;
 const statusKind=/(?:^|\s)(?:закрытые|заверш[её]нные|завершены)(?:\s|[.!?]|$)/iu.test(text)?'done':/(?:^|\s)все(?:\s|$)/iu.test(text)?'all':'open';
 const overdue=/просроч/iu.test(text);return {status:overdue?'open':statusKind,overdue};
}
function personalTasks(command){return !!details(command);}
module.exports={personalTasks,details};
