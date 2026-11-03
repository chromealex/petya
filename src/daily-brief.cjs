function dailyBrief({records,reminders,contexts,jira=[],slackEnabled=false,now=Date.now()}){
 const start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
 const lines=['На сегодня, '+new Date(now).toLocaleDateString('ru-RU')+'. Сводка по сохранённым данным Пети.'];
 const upcoming=reminders.filter(r=>r.state==='pending'&&r.due<end.getTime()).sort((a,b)=>a.due-b.due);
 lines.push('Напоминания: '+(upcoming.length?upcoming.length:'нет')+'.');
 for(const r of upcoming.slice(0,8))lines.push((r.due<now?'Просрочено: ':new Date(r.due).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+': ')+r.text);
 const tasks=records.filter(r=>r.state!=='expired'&&!(r.executionState==='completed')).sort((a,b)=>b.at-a.at);
 lines.push('Незавершённые или ожидающие поручения: '+tasks.length+'.');
 const states={routing:'нужен исполнитель','project-required':'нужен проект',failed:'ошибка',unknown:'передача не подтверждена',submitted:'передано; завершение не подтверждено',ready:'ожидает передачи',inProgress:'в работе',needsAttention:'нужно решение',interrupted:'прервано'};
 for(const r of tasks.slice(0,8))lines.push(((r.keys||[]).join(', ')||r.command||'Поручение')+' — '+(states[r.executionState||r.state]||r.state)+', запись от '+new Date(r.checkedAt||r.at).toLocaleString('ru-RU'));
 const created=jira.filter(r=>!r.retentionExpired&&r.at>=start.getTime()&&r.at<=now).flatMap(r=>(r.rows||[]).filter(v=>v.key&&v.state!=='deleted').map(v=>({key:v.key,title:v.title||v.snapshot?.summary||'',at:r.at})));
 lines.push('Созданные Петей сегодня задачи Jira: '+created.length+'.');for(const r of created.slice(0,8))lines.push(r.key+' · '+r.title+' (это запись о создании, не текущий статус Jira)');
 const messages=slackEnabled?contexts.filter(c=>/slack/iu.test(c.source||'')).flatMap(c=>c.messages?.map(m=>({at:m.at,title:c.title,text:m.text}))||[{at:c.at,title:c.title,text:c.text}]).filter(c=>c.at>=start.getTime()&&c.at<=now).sort((a,b)=>b.at-a.at):[];
 lines.push('Сохранённые сообщения Slack за сегодня: '+messages.length+'.');for(const m of messages.slice(0,5))lines.push(new Date(m.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+' · '+m.title+': '+String(m.text||'').slice(0,400));
 lines.push('Это не полная сводка почты и календаря: эти источники пока не подключены к сценарию.');
 return {handled:true,text:lines.join('\n')};
}
module.exports={dailyBrief};
