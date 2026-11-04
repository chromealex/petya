function binding(topic={}){return JSON.stringify([topic.id||'',topic.projectId||'',topic.projectMemoryId||'']);}
function recordReceipt(topic,receipt){
 if(!topic||!receipt||!['send','create','delete','change','run','read'].includes(receipt.action)||!['slack','jira','mail'].includes(receipt.service)||!['confirmed','unknown','rejected'].includes(receipt.status)||typeof receipt.id!=='string'||!receipt.id)return false;
 const rows=topic.actionReceipts||=[];const row={...receipt,binding:binding(topic)};const index=rows.findIndex(r=>r.id===row.id);if(index>=0)rows[index]=row;else rows.push(row);if(rows.length>200)rows.splice(0,rows.length-200);return true;
}
function actionConfirmation(command,topic={}){
 const text=String(command||'').trim();
 if(/[«»"“”]|если|объясни|почему|что означает/iu.test(text))return null;
 const match=/^ты\s+(?:уже\s+)?(?:что-то\s+)?(отправил|создал|удалил|изменил|поменял|опубликовал|запустил|проверил)\s+[^?!\n]+[?!.]*(?:\s+Я ничего не просил отправлять[.!]?)?$/iu.exec(text);
 const follow=/^(?:но мне нужен честный ответ:\s*)?есть ли подтверждение (?:выполнения|отправки)[?!.]*$/iu.test(text);
 if(!match&&!follow)return null;
 if(/(?:и|а)\s+(?:отправь|создай|проверь|расскажи|объясни)/iu.test(text))return null;
 const action=follow?null:/отправ|опубликов/iu.test(match[1])?'send':/создал/iu.test(match[1])?'create':/удал/iu.test(match[1])?'delete':/запуст/iu.test(match[1])?'run':/провер/iu.test(match[1])?'read':'change';
 const services=['slack','jira'].filter(s=>new RegExp(s,'iu').test(text));if(/mail|email|e-mail|почт|письм/iu.test(text))services.push('mail');const channels=text.match(/#[\w-]+/gu)||[];const keys=text.match(/[A-Z][A-Z\d_]*-\d+/gu)||[];
 const candidates=(topic.actionReceipts||[]).filter(r=>r.binding===binding(topic)&&(!action||r.action===action)&&(!services.length||services.includes(r.service))&&(!channels.length||channels.includes('#'+r.channelName))&&(!keys.length||keys.includes(r.key)));
 // A remembered statement or draft is not a service acknowledgement.
 if(!candidates.length)return 'Нет подтверждения выполнения этого действия в данных диалога. Обсуждение или черновик не означают отправку или изменение в сервисе.';
 if(/сейчас|сегодня|вчера|последн|именно это|это сообщение|это письмо/iu.test(text))return 'Есть сохранённые результаты действий, но они не подтверждают именно этот запрос или период. Уточни сообщение, канал или ключ задачи.';
 if(follow)return 'Не могу сопоставить сохранённое подтверждение без конкретного действия. Уточни канал, сообщение или ключ задачи.';
 const qualifier=text.slice(match[0].toLowerCase().indexOf(match[1].toLowerCase())+match[1].length).replace(/#[\w-]+|[A-Z][A-Z\d_]*-\d+/gu,' target ').toLowerCase().replace(/ё/gu,'е');
 const allowed=new Set('сообщение сообщения письмо письма отчет отчеты задачу задачи данные изменения проверку запуск в на из этот этом диалоге чат чате канал канале jira slack или и target'.split(' '));
 if((qualifier.match(/[\p{L}\p{N}_-]+/gu)||[]).some(word=>!allowed.has(word)))return 'Есть сохранённые результаты, но адресата или условия этого запроса нельзя сопоставить однозначно. Уточни точный канал или задачу.';
 const latest=candidates.at(-1);
 if(latest.status==='unknown')return 'Сервис не подтвердил результат. Не могу утверждать, что действие выполнено; перед повтором нужна проверка.';
 if(latest.status==='rejected')return 'Нет: сервис отклонил действие. Подтверждения выполнения нет.';
 if(latest.status!=='confirmed')return 'Нет подтверждения выполнения.';
 if(candidates.length>1)return 'Найдено несколько сохранённых результатов. Уточни канал или задачу, чтобы сопоставить нужное действие.';
 return 'По сохранённому подтверждению '+latest.service+': '+({send:'сообщение отправлено',create:'задача создана',delete:'удаление выполнено',change:'изменение выполнено',run:'запуск выполнен',read:'проверка выполнена'}[latest.action])+(latest.channelName?' в #'+latest.channelName:'')+(latest.key?' ('+latest.key+')':'')+'.';
}
module.exports={recordReceipt,actionConfirmation,binding};
