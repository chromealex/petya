// These replies describe evidence limits, not guessed project facts.
function workEvidenceReply(command,topic={},members=[],notes='',supplementalContext=''){
 members=Array.isArray(members)?members.filter(m=>m&&typeof m==='object'):[];
 const text=String(command||'').trim(),data=topic?.lastData;
 const norm=v=>String(v||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const hay=' '+norm(text)+' ',contains=v=>norm(v)&&hay.includes(' '+norm(v)+' ');
 const prior=(topic?.messages||[]).filter(m=>m.role==='user'&&m.text!==command).at(-1)?.text||'';
 if(/^ты (?:уже )?(?:вн[её]с|отправил|создал|закрыл|назначил)/iu.test(text)&&/обсуд|объясни|предложи|черновик|как лучше/iu.test(prior)&&/не (?:меняй|отправляй|создавай|пиши)|(?:выполнять|создавать.{0,10}) не надо/iu.test(prior)&&!/(?:а|но|зато|лучше)\s+(?:отправь|создай|измени|назначь|удали|закрой)/iu.test(prior))return 'Подтверждения изменений или отправки нет: ранее был запрос только на обсуждение или черновик.';
 // A bare confirmation question without any earlier dialogue or result cannot
 // establish an action. Keep histories with actual results available to the model.
 const earlier=(topic?.messages||[]).filter(m=>m.text!==command);
 const explained=/^объясни,? что означает [«"](закрой|создай|назначь|удали)\s+([^»"]+)[»"][.!]?(?:\s+Выполнять не надо[.!]?)?$/iu.exec(text);
 if(explained){const meanings={закрой:'перевести задачу в завершённый статус',создай:'создать новую задачу',назначь:'указать исполнителя задачи',удали:'удалить указанный объект'};return 'Это просьба '+meanings[explained[1].toLowerCase()]+' ('+explained[2]+'). Я объясняю значение команды; действие не выполнялось.';}
 if(!earlier.length&&!data&&!members.length&&!notes&&!supplementalContext&&/^(?:кто|когда|сколько|какое|какой) /iu.test(text)&&/закрыт(?:ый|ом|ого) канал|личн.{0,15}почт/iu.test(text))return 'Нет данных из этого источника. Без доступа и результата проверки не могу определить ответ.';
 if(!earlier.length&&!data&&!supplementalContext&&/^ты (?:уже )?(?:отправил|создал|удалил|изменил|поменял|проверил|запустил|пригласил|опубликовал|загрузил|купил) [^?!\n]+[?!.]*$/iu.test(text))return 'Нет подтверждения выполнения: в этом диалоге нет результата такого действия.';
 if(!earlier.length&&!data&&!members.length&&!notes&&!supplementalContext&&/^(?:какой|какая|какое|сколько|кто|когда) /iu.test(text)&&/(?:мо(?:й|я|ё|е|его|ей|их)|наш(?:е|ем|ей|его|их|а|и)|внутренн)/iu.test(text)&&/баланс|сч[её]т|писем|почт|ошиб|парол/iu.test(text)&&!/[«»"“”]|(?:если|например|допустим|представь|объясни|что значит)/iu.test(text))return 'У меня нет данных для такого ответа. Нужны сведения из соответствующего сервиса; отсутствие данных не означает ноль.';
 if(!data&&!supplementalContext&&!earlier.length&&!members.length&&!notes&&/^(?:кто|когда|сколько) /iu.test(text)&&/(?:сведений|данных|информации) (?:о [^,?!]{1,40} )?нет/iu.test(text))return 'Нет данных, чтобы это определить. Отсутствие сведений не означает отсутствие людей или задач.';
 const staticDirectory=Array.isArray(members)&&members.length&&(!data||Object.keys(data).length===0)&&!notes;
 const statements=(topic?.messages||[]).filter(m=>m.role==='user'&&m.text!==command&&!/^(?:кто|что|как|чем|сколько|где|когда|в каком|к какому|за что)/iu.test(String(m.text||''))).map(m=>String(m.text||''));
 const leadership=/руковод|тимлид|лидер|владел|директор|менеджер|(?:^|\s)лид(?=\s|$)|\blead\b|\bowner\b|\bmanager\b/iu;
 const facts=JSON.stringify({data,members,notes,statements,supplementalContext});
 if(/^кто (?:руководитель|владелец|лидер|тимлид) проекта [^?!\n]+[?!.]*$/iu.test(text)&&!leadership.test(facts))return 'В доступных данных не указан руководитель или владелец проекта. Исполнитель отдельной задачи не обязательно руководит проектом.';
 if(/^(?:когда (?:точно )?(?:выйдет|будет) (?:следующий )?релиз |назови (?:точную )?дату (?:выхода )?релиза )/iu.test(text)&&!/releaseDate|release_date|releases|versions|релиз|выпуск/iu.test(facts))return 'Дата релиза не указана в доступных данных. Срок отдельной задачи не подтверждает дату выхода релиза.';
 const activity=/сегодня|сейчас|завтра|свобод|отпуск|выполнил|завершил|назначен|20\d\d|\d{1,2}[./]\d{1,2}/iu;
 const personQuestion=/^(?:а\s+)?(?:он|она|они|значит|сколько|можно|можем|ему|ей)/iu.test(text)&&(/(?:^|\s)(?:он|она|они|ему|ей|него|неё|нее|сотрудник|коллег)(?=\s|[,.!?]|$)/iu.test(text)||members.some(m=>contains(m.name)));
 if(staticDirectory&&personQuestion){
  if(leadership.test(text)&&!members.some(m=>leadership.test(m.role||''))&&!statements.some(t=>leadership.test(t)))return 'Нет подтверждённых данных о руководстве или владении проектом. Принадлежность к команде этого не доказывает.';
  if(/сейчас|сегодня|свобод|завтра|час|уже|гарант/iu.test(text)&&!members.some(m=>activity.test((m.role||'')+' '+(m.responsibilities||'')))&&!statements.some(t=>activity.test(t)))return 'Нет подтверждённых данных о текущей занятости, выполненной работе или свободном времени. В справочнике указаны только роли и проекты.';
 }
 const singleQuestion=/^(?:а\s+)?(?:какая|какой|кто|кем|чем|за что|в каком|какому)/iu.test(text)&&!/(?:^|\s)(?:оба|обоих|обе|все|каждый|каждого|сравни|перечисли)(?=\s|$)/iu.test(text);
 if(singleQuestion&&/роль|обязан|отвеча|занима|специализац|сотрудник|коллег/iu.test(text)&&Array.isArray(members)){
  const names=new Map();
  for(const member of members){for(const name of new Set([member.name,...String(member.aliases||'').split(/[,;\n]/)].map(norm).filter(Boolean))){if(!names.has(name))names.set(name,[]);names.get(name).push(member);}}
  for(const [name,rows] of names){if(rows.length<2||!contains(name))continue;
   const scoped=rows.filter(row=>String(row.projects||'').split(/[,;\n]/).some(contains));
   if(scoped.length===1)continue;
   const choices=scoped.length?scoped:rows;
   return 'Есть несколько сотрудников с этим именем: '+choices.slice(0,8).map(row=>row.name+' — '+(row.projects||'проект не указан')+' ('+(row.role||'роль не указана')+')').join('; ')+'. Уточни проект или сотрудника.';
  }
 }
 if(singleQuestion&&/задач/iu.test(text)&&!/[A-Z][A-Z0-9_]*-\d+/iu.test(text)&&Array.isArray(data?.issues)){
  const groups=new Map();for(const issue of data.issues){const title=issue.fields?.summary||issue.summary;if(!title||!contains(title))continue;const key=norm(title);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(issue);}
  for(const rows of groups.values())if(rows.length>1)return 'Есть несколько задач с таким названием: '+rows.slice(0,8).map(row=>row.key+' — '+(row.fields?.summary||row.summary)).join('; ')+'. Уточни ключ задачи.';
 }
 const draft=/^(?:подготовь|составь|напиши) черновик сообщения(?: команде)? о блокере ([A-Z][A-Z0-9_]*-\d+)[.!]?(?:\s+не отправляй[.!]?)?$/iu.exec(text);
 if(draft&&Array.isArray(data?.issues)){
  const rows=data.issues.filter(i=>String(i.key).toLowerCase()===draft[1].toLowerCase());
  if(rows.length===1){const row=rows[0],f=row.fields||row,blocking=[];
   for(const link of Array.isArray(f.issuelinks)?f.issuelinks:[]){if(!link||typeof link!=='object')continue;for(const side of ['inward','outward'])if(link[side+'Issue']&&/^(?:is blocked by|depends on|блокируется|заблокирован[ао]?|зависит от)$/iu.test(link.type?.[side]||''))blocking.push(link[side+'Issue'].key);}
   return 'Черновик: '+row.key+' «'+(f.summary||'Без названия')+'». '+(blocking.length?'Блокирующие задачи: '+[...new Set(blocking)].join(', ')+'.':'Причина блокировки в данных не указана.')+(f.assignee?.displayName?' Исполнитель: '+f.assignee.displayName+'.':f.assignee===null?' Исполнитель не назначен.':' Исполнитель не указан в данных.')+' Сообщение не отправлено.';
  }
 }

 // This generator has no tools. A previous read may exist, but this reply did
 // not perform a new service check. Do not intercept compound requests.
 if(/(?:^|\s)сейчас(?=\s|[.!?]|$)/iu.test(text)&&/^ты\s+(?:(?:сейчас|действительно)\s+)?проверил\s+(?:это|данные|статус|задачи|jira|slack|почту)(?:\s+в\s+(?:подключ[её]нном\s+)?сервисе)?(?:\s+(?:прямо\s+)?сейчас)?[.!?]*$/iu.test(text))return 'Нет, в этом ответе я не проверял сервис заново. Использую только сохранённые сведения.';
 const deadlineAdvice=/^как(?: лучше)? обсудить(?: с [^?!\n]+?)? дедлайн ([A-Z][A-Z0-9_]*-\d+)[?!.]?(?:\s+не пиши(?: ей|ему|им)?[.!]?)?$/iu.exec(text);
 if(deadlineAdvice&&Array.isArray(data?.issues)){
  const rows=data.issues.filter(i=>String(i.key).toLowerCase()===deadlineAdvice[1].toLowerCase());
  if(rows.length===1){const row=rows[0],f=row.fields||row;return 'По сохранённой карточке '+row.key+(f.duedate?' срок — '+f.duedate+'.':' срок не указан.')+' Можно спросить: «Как оцениваешь срок? Есть ли блокеры и нужна ли помощь?» Это предложение для обсуждения; сообщение не отправлено.';}
 }
 if(/^(?:а\s+)?(?:сколько|какое количество|каково число)/iu.test(text)&&/задач/iu.test(text)&&/скрыт|недоступ|не вид/iu.test(text)&&!supplementalContext&&!notes&&!statements.some(t=>/скрыт|недоступ|не вид/iu.test(t))&&!Number.isFinite(data?.hiddenIssueCount)&&!data?.accessAudit&&!/\d/iu.test(text.replace(/[«"“][^»"”]*[»"”]/gu,'')))return 'Не знаю, сколько задач скрыто от аккаунта. По списку доступных задач нельзя определить количество недоступных.';
 if(!data||!Array.isArray(data.issues))return null;
 // Task assignment/status is not a worklog. Missing logged time is unknown,
 // including when the person has no tasks in this partial snapshot.
 const timeQuestion=/^сколько (?:времени|часов|минут) [^?!\n]+(?:потратил|потратила|затратил|затратила|отработал|отработала)[^?!\n]*[?!.]*$/iu.test(text);
 const timeEvidence=/worklog|timeSpent|timespent|timetracking|трудозатрат|(?:потратил|затратил|отработал)[аи]?[^.!?]{0,40}\d|\d[^.!?]{0,20}(?:час|минут)/iu;
 if(timeQuestion&&!timeEvidence.test(facts)&&!/[«»"“”]|если|допустим|представь/iu.test(text))return 'Нет данных об учёте времени. По списку задач нельзя определить трудозатраты; отсутствие записей не означает ноль часов.';
 // Exact counts over an explicitly scoped snapshot are arithmetic, not prose generation.
 if(/^сколько /iu.test(text)&&/незаверш[её]н|открытых/iu.test(text)&&/задач/iu.test(text)&&/предоставленном списке|этом списке|данной выборке/iu.test(text)&&!/(?:если|предполож|высок|низк|приоритет|просроч|дедлайн|срок|создан|обновл|сегодня|вчера|блок|подзадач)/iu.test(text)){
  const people=[...new Set(data.issues.map(i=>(i.fields||i).assignee?.displayName).filter(Boolean))].filter(contains);
  if(people.length===1){const name=people[0],rows=data.issues.filter(i=>(i.fields||i).assignee?.displayName===name);
   const identities=new Set(rows.map(i=>(i.fields||i).assignee?.accountId).filter(Boolean));
   if(identities.size>1)return 'В списке несколько сотрудников с именем '+name+'. Уточни аккаунт, чтобы посчитать задачи.';
   if(rows.some(i=>!['new','indeterminate','done'].includes((i.fields||i).status?.statusCategory?.key)))return 'Не могу точно посчитать незавершённые задачи: у части карточек не указана категория статуса.';
   const count=rows.filter(i=>(i.fields||i).status.statusCategory.key!=='done').length;
   return /только (?:числом|число)|одним числом/iu.test(text)?String(count):'В предоставленном списке у '+name+' незавершённых задач: '+count+'.';
  }
 }
 if(/^есть ли/iu.test(text)&&/отпуск/iu.test(text)&&data.calendar==null&&data.vacations==null&&!notes&&!statements.some(t=>/отпуск/iu.test(t))&&!members.some(m=>/в отпуске|отпуск с|отпуск.*(?:\d|сегодня|завтра|недел)/iu.test((m.role||'')+' '+(m.responsibilities||''))))return 'В доступных данных нет сведений об отпуске. По задачам и роли нельзя определить его наличие или отсутствие.';
 const at=typeof data.at==='number'?data.at:Date.parse(data.at);
 const date=new Date(at);
 if(Number.isFinite(date.getTime())&&/^(?:а\s+)?(?:можно|можем|актуал|верен|точен|этот|эти|это|статус|данн)/iu.test(text)&&/(?:статус|данн|сведен)/iu.test(text)&&/актуал|верен|точен/iu.test(text)&&/сейчас|сегодня|теперь/iu.test(text))return 'Нет, сохранённый снимок от '+date.toISOString().slice(0,10)+' не подтверждает актуальность прямо сейчас. Нужна новая проверка источника.';
 const priorUsers=(topic.messages||[]).filter(m=>m.role==='user'&&m.text!==command).map(m=>String(m.text||''));
 const suppliedSprint=data.sprint!=null||data.sprintId!=null||data.scope?.type==='sprint'||[text,...priorUsers].some(t=>/спринт/iu.test(t)&&/\d|все (?:эти )?задачи|включает/iu.test(t));
 if(/^(?:а\s+)?(?:какой|сколько|каков|покажи|назови)/iu.test(text)&&/спринт/iu.test(text)&&/процент|прогресс|выполнен/iu.test(text)&&!suppliedSprint)return 'Не могу назвать процент выполнения спринта: в данных нет его состава и базы расчёта. Обычный список задач проекта не является списком задач спринта.';
 // High-confidence field questions are answered from the selected record,
 // never from free-form descriptions or the model's guess about that record.
 if(/^(?:а\s+)?(?:кто|какой|какая|в каком|что со|закрыт[аоы]? ли|завершен[аоы]? ли)/iu.test(text)&&!/(?:блокир|зависим|связан|родител|подзадач|если|предполож|допустим|гипотет|планиру|будет|ответь|только|одним|формат|таблиц|английск|JSON)/iu.test(text)&&!/[.!?]\s+[\p{L}]/u.test(text)){
  const fields=[];
  if(/^кто/iu.test(text)&&/назнач|исполнител|отвеча|делает/iu.test(text))fields.push('assignee');
  if(/статус|в каком состоянии/iu.test(text))fields.push('status');
  if(/приоритет/iu.test(text))fields.push('priority');
  if(/срок|дедлайн/iu.test(text))fields.push('duedate');
  if(/^(?:закрыт[аоы]?|завершен[аоы]?) ли/iu.test(text))fields.push('closed');
  const explicit=[...new Set((text.match(/[A-Z][A-Z0-9_]*-\d+/giu)||[]).map(k=>k.toUpperCase()))];
  let key=explicit.length===1?explicit[0]:null;
  if(!key&&!explicit.length&&!/проект/iu.test(text)&&/(?:^|\s)(?:этой|эту|этот|эта|это|нее|неё|ней|него|её|ее|его|ею|ей)(?=\s|[,.!?]|$)/iu.test(text)&&!/[«"“]/u.test(text)){
   const previousKeys=[...new Set((prior.match(/[A-Z][A-Z0-9_]*-\d+/giu)||[]).map(k=>k.toUpperCase()))];
   if(previousKeys.length===1)key=previousKeys[0];
  }
  if(fields.length===1&&key){
   const rows=data.issues.filter(i=>String(i.key||'').toUpperCase()===key);
   if(rows.length===0)return 'В сохранённых данных нет карточки '+key+'. Не могу подтвердить её поля.';
   if(rows.length>1)return 'В сохранённых данных несколько карточек '+key+'. Нужна проверка, какую использовать.';
   const row=rows[0],f=row.fields||row,prefix='По сохранённой карточке '+key+': ';
   switch(fields[0]){
    case 'assignee':return prefix+(f.assignee===null?'исполнитель не назначен.':f.assignee?.displayName?'исполнитель — '+f.assignee.displayName+'.':typeof f.assignee==='string'&&f.assignee?'исполнитель — '+f.assignee+'.':f.assignee?.accountId?'исполнитель указан (ID '+f.assignee.accountId+'), но имя в данных отсутствует.':'данных об исполнителе нет.');
    case 'status':{const status=typeof f.status==='string'?f.status:f.status?.name;return prefix+(status?'статус — '+status+'.':'статус не указан.');}
    case 'priority':{const priority=typeof f.priority==='string'?f.priority:f.priority?.name;return prefix+(priority?'приоритет — '+priority+'.':'приоритет не указан.');}
    case 'duedate':return prefix+(f.duedate?'срок — '+f.duedate+'.':'срок не указан.');
    case 'closed':{const category=f.status?.statusCategory?.key;return prefix+(category==='done'?'задача завершена.':category==='new'||category==='indeterminate'?'задача ещё не завершена.':'категория завершения не указана, нельзя подтвердить закрытие.');}
   }
  }
 }
 return null;
}
module.exports={workEvidenceReply};
