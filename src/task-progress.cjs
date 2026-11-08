function isProgress(text){return /^(?:петя[,\s]*)?(?:чем закончил[а-я]*|что (?:там )?с (?:той |этой |последней )?задач|(?:проверь |покажи )?статус (?:задач|поручен)|как продвигается)/iu.test(text);}
function candidates(command,records,project=''){
 let rows=records.filter(r=>r.state!=='expired');
 const keys=command.match(/\b[A-Z][A-Z0-9_]+-\d+\b/gi)||[];
 if(keys.length)return rows.filter(r=>keys.some(k=>(r.keys||[]).some(v=>v.toLowerCase()===k.toLowerCase())));
 if(project)rows=rows.filter(r=>(r.keys||[]).some(k=>k.startsWith(project+'-'))||r.project?.name===project);
 if(/последн/iu.test(command))return [...rows].sort((a,b)=>b.at-a.at).slice(0,1);
 return rows;
}
function summarize(row,live,error=''){
 const label=(row.keys||[]).join(', ')||row.command||'Поручение';
 const names={completed:'Исполнитель завершил работу',failed:'Работа завершилась ошибкой',interrupted:'Работа прервана',inProgress:'Исполнитель работает',needsAttention:'Исполнитель ждёт твоего решения',submitted:'Запрос передан; завершение пока не подтверждено',routing:'Ожидает выбора исполнителя','project-required':'Ожидает выбора проекта',ready:'Готово к передаче',unknown:'Передача не подтверждена',expired:'История удалена по сроку хранения'};
 const state=row.state==='expired'?'expired':live?.status||row.executionState||row.state;
 const answer=live?.answer||row.resultText||'';
 return {handled:true,text:label+': '+(names[state]||'Состояние: '+state)+'.'+(live?' Проверено сейчас.':' Последняя запись от '+new Date(row.checkedAt||row.at).toLocaleString('ru-RU')+'.')+(answer?'\nОтвет исполнителя: '+answer:'')+(error?'\nСвежий статус недоступен: '+error:''),agentId:row.id};
}
module.exports={isProgress,candidates,summarize};
