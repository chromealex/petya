// A Jira status the user names: a status category («to do», «в работе») or an exact status name.
function statusFilter(text){
 const s=String(text||'');
 if(/(?:^|[\s(«"])(?:to ?do|тудушк\p{L}*|туду|к выполнению|не начат\p{L}*|бэклог\p{L}*|backlog|открытых к работе)(?=[\s,.!?)»"]|$)/iu.test(s))return {category:'To Do'};
 if(/(?:^|[\s(«"])(?:in progress|в работе|в процессе|в разработке|делаю сейчас|в прогрессе)(?=[\s,.!?)»"]|$)/iu.test(s))return {category:'In Progress'};
 const named=/(?:в статусе|со статусом|статус(?:ом)?)\s+[«"]?([\p{L}\p{N} _-]{2,40}?)[»"]?(?=[,.!?]|$)/iu.exec(s)||/(?:^|\s)(?:в|на|из)\s+[«"]?((?:owner review|code review|on hold|ready for qa|ready for test|in review|in qa|qa|review|ревью|блок\p{L}*))[»"]?(?=[\s,.!?]|$)/iu.exec(s)||/(?:^|[\s«"])((?:owner review|code review|on hold|ready for qa|ready for test|in review))(?=[\s,.!?»"]|$)/iu.exec(s);
 if(named){const name=named[1].trim();const map={'ревью':'Review','блок':'Blocked'};return {name:map[name.toLowerCase()]||map[name.toLowerCase().slice(0,4)]||name};}
 return null;
}
function details(command,topic){
 let text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/^пожалуйста[,\s]+/iu,'');
 if(topic?.taskAssignee==='currentUser'){const follow=text.replace(/^а\s+/iu,'');const followFilter=statusFilter(follow);if(followFilter&&!/(?:создай|закрой|назначь|перенеси|удали|отправь|напиши)(?=\s|$)/iu.test(follow)&&follow.split(/\s+/).length<=8)return {status:'open',overdue:false,...followFilter};if(/^(?:обнови(?: ответ| данные)?|проверь ещё|посмотри ещё|только (?:просроченные|закрытые|открытые|незаверш[её]нные)|(?:теперь )?(?:в|по) (?:проект[еу]? )?[A-Z][A-Z0-9_-]*)[.!?]*$/iu.test(follow)){const overdue=/просроч/iu.test(follow)?true:/только (?:закрытые|открытые|незаверш)/iu.test(follow)?false:!!topic.personalTaskOverdue;return {status:/просроч|только (?:открытые|незаверш)/iu.test(follow)?'open':/только закрытые/iu.test(follow)?'done':topic.personalTaskStatus||'open',overdue};}}
 const kind=v=>({overdue:/просроч/iu.test(v),status:/(?:^|\s)(?:закрыт|заверш[её]н)/iu.test(v)&&!/незаверш/iu.test(v)?'done':/(?:^|\s)все(?:\s|[.!?]|$)/iu.test(v)?'all':'open'});
 // Inside «Мои задачи»: «а просроченные?», «только закрытые», «все».
 if(topic?.taskAssignee==='currentUser'){const follow=text.replace(/^(?:(?:а|и|ну|теперь|только|покажи|покажи только)[,\s]+)+/iu,'');if(/^(?:просроченн\p{L}*|закрыт\p{L}*|открыт\p{L}*|заверш[её]нн\p{L}*|незаверш[её]нн\p{L}*|все)(?:\s+(?:задачи|таски))?(?:\s+(?:на мне|у меня|мои))?[.!?]*$/iu.test(follow)){const k=kind(follow);return {status:k.overdue?'open':k.status,overdue:k.overdue};}}
 // «Покажи закрытые на мне» — a status and the user without the word «задачи».
 {const bare=text.replace(/^(?:(?:а|и|ну|покажи|какие|все)[,\s]+)+/iu,'');if(/^(?:просроченн\p{L}*|закрыт\p{L}*|открыт\p{L}*|заверш[её]нн\p{L}*|незаверш[её]нн\p{L}*)\s+(?:на мне|у меня|за мной)[.!?]*$/iu.test(bare)){const k=kind(bare);return {status:k.overdue?'open':k.status,overdue:k.overdue};}}
 // A leading «а / и / ну / теперь» only continues the conversation («А какие задачи на мне?»).
 text=text.replace(/^(?:(?:а|и|ну|теперь|так)[,\s]+)+/iu,'');
 if(/^(?:не\s|[«"“]|если|объясни|переведи|придумай|что такое|что означает)/iu.test(text)||/(?:^|\s)(?:и|а|но|потом|затем)(?:\s|$)/iu.test(text)||/[;\n]/.test(text))return null;
 if(/(?:вчера|завтра|сегодня|недел|asana|асана|асане|notion|trello)/iu.test(text))return null;
 const suffix='(?:\\s+(?:в|по)\\s+[^.!?]+)?[.!?]*';
 const status='(?:(?:все|просроченные|открытые|незаверш[её]нные|закрытые|заверш[её]нные)\\s+)?';
 const noun='(?:задачи|таски)';
 const possessive=new RegExp('^(?:(?:покажи|перечисли|проверь|какие|список)\\s+)?'+status+'(?:мои\\s+'+status+noun+'|'+noun+'(?:,)?\\s+(?:на мне|назначенные мне|назначены на меня|у меня))'+suffix+'$','iu');
 const indirect=new RegExp('^(?:список моих задач|какие из моих задач завершены|(?:какие\\s+)?у меня задачи|что (?:(?:сейчас )?висит на мне|на мне|у меня в работе|назначено мне|мне назначено))'+suffix+'$','iu');
 // Any word order: a task word, a reference to the user and no action («какие задачи открытые на мне»).
 const flexible=/(?:^|\s)(?:задач\p{L}*|таск\p{L}*|тикет\p{L}*)(?=\s|[,.!?]|$)/iu.test(text)&&/(?:^|\s)(?:на мне|у меня|за мной|мои|моих|мой|назначенн\p{L}* (?:мне|на меня)|мне назначен\p{L}*)(?=\s|[,.!?]|$)/iu.test(text)&&!/(?:^|\s)(?:создай|созда[тв]|заведи|завести|закрой|закрыть|назначь|назначить|перенеси|удали|измени|поменяй|отправь|напиши|добавь|оцени|разбей)(?=\s|[,.!?]|$)/iu.test(text)&&/^(?:покажи|перечисли|проверь|посмотри|глянь|какие|какая|сколько|что|список|есть ли|мои|задачи|таски|открытые|незаверш|просроч|закрытые)/iu.test(text);
 if(!possessive.test(text)&&!indirect.test(text)&&!flexible)return null;
 const statusKind=/(?:^|\s)(?:закрытые|заверш[её]нные|завершены)(?:\s|[.!?]|$)/iu.test(text)?'done':/(?:^|\s)все(?:\s|$)/iu.test(text)?'all':'open';
 const overdue=/просроч/iu.test(text),filter=statusFilter(text);return {status:overdue||filter?'open':statusKind,overdue,...filter||{}};
}
function personalTasks(command){return !!details(command);}
module.exports={personalTasks,details,statusFilter};
