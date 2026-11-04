const {personalTasks}=require('./personal-tasks.cjs');
function classify(command,topic){
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/^пожалуйста[,\s]+/iu,'');
 const work=/(?:задач|таск|проект|команд|коллег|на мне|назначен|загруз|чем занят|кто чем|что делает|свободен|онлайн|у меня в работе|кто отвечает)/iu.test(text);
 if(/^(?:не\s|не надо\s|[«"“]|если\s|что такое|что означает|объясни|переведи|придумай|как лучше|давай обсудим)/iu.test(text))return {kind:'chat'};
 if((work||/[A-Z][A-Z0-9_]*-\d+/u.test(text))&&/^(?:создай|создать|закрой|закрыть|назначь|переназначь|удали|отправь|измени|обнови статус)\s/iu.test(text))return {kind:'action'};
 if(topic?.taskAssignee==='currentUser'&&require('./personal-tasks.cjs').details(text,topic))return {kind:'personal'};
 if(/^а у меня[.!?]*$/iu.test(text))return topic?.jiraProject?{kind:'personal',query:'Мои задачи'}:{kind:'clarify',text:'Уточни проект для проверки твоих задач.'};
 const colleague=/^а у (.+?)[.!?]*$/iu.exec(text);if(colleague)return topic?.jiraProject?{kind:'workload',query:'Какие задачи у '+colleague[1]+' в проекте '+topic.jiraProject}:{kind:'clarify',text:'Уточни коллегу и проект, чтобы проверить назначенные задачи.'};
 if(topic?.workSelection?.personName&&/^только (?:просроченные|закрытые|открытые|незаверш[её]нные)[.!?]*$/iu.test(text))return {kind:'workload',query:text.replace(/[.!?]*$/u,'')+' задачи у '+topic.workSelection.personName+' в проекте '+topic.jiraProject};
 if(topic?.workSelection?.candidates?.length){const choices=topic.workSelection.candidates.filter(p=>text.replace(/[.!?]$/u,'').toLocaleLowerCase()===p.id.toLocaleLowerCase()||text.replace(/[.!?]$/u,'').toLocaleLowerCase()===p.name.toLocaleLowerCase());if(choices.length===1)return {kind:'workload',query:'Задачи исполнителя Jira ID: '+choices[0].id+' в проекте '+topic.jiraProject};}
 const projectChange=/^(?:теперь )?(?:в|по) (?:проект[еу]? )?([A-Z][A-Z0-9_-]*)[.!?]*$/iu.exec(text);
 if(projectChange&&topic?.workSelection){const s=topic.workSelection;return s.workflow==='project-status'?{kind:'status',query:'Статус проекта '+projectChange[1]}:{kind:'workload',query:(s.status==='overdue'?'Просроченные ':s.status==='done'?'Закрытые ':s.status==='open'?'Открытые ':'')+(s.personId?'задачи исполнителя Jira ID: '+s.personId:'загрузка команды')+' в проекте '+projectChange[1]};}
 if(/^а мои[.!?]*$/iu.test(text))return topic?.kind==='tasks'?{kind:'personal',query:'Мои задачи'}:{kind:'clarify',text:'Ты имеешь в виду задачи, назначенные твоему аккаунту Jira? Уточни проект.'};
 if(/^(?:что делает|как работает).*(?:функци|метод|код|скрипт|алгоритм|программ)/iu.test(text))return {kind:'chat'};
 if(/(?:нагруз|загруз).*(?:процессор|сервер|CPU|GPU|диск|памят|страниц|файл|приложен)/iu.test(text))return null;
 if(/^кто отвечает за/iu.test(text)&&!/(?:задач|проект)/iu.test(text))return {kind:'chat'};
 // «команда» as a shell/console command, not the team.
 if(/(?:пример\w*|напиши|какой|какая|какую|подскажи|синтаксис\w*)\s+(?:\S+\s+)?команд|команд\w*\s+(?:для|в\s+терминал|git|гит|bash|docker|npm|linux|консол|shell)|(?:терминал|консол)\S*.*команд/iu.test(text)&&!/(?:задач|коллег|загруз|нагруз|в команде|команды проекта)/iu.test(text))return null;
 if(!work)return null;
 // Notion and Asana have their own readers: leave such questions to them instead of the Jira work route.
 if(/(?:asana|асан|notion|ноушен|ноушн)/iu.test(text)&&!/(?:задач|таск|тикет)/iu.test(text))return null;
 if(/(?:asana|асана|асане|notion|ноушен|trello|github|гитхаб|linear|clickup)/iu.test(text))return {kind:'clarify',text:'Этот рабочий список читается из Jira. Уточни нужный сервис и проект; данные разных сервисов не буду смешивать.'};
 if(/(?:\sи\s|;|\.\s).*(?:отправ|переназнач|удал|закр|созда|опублику|покажи|проверь)/iu.test(text))return {kind:'clarify',text:'В запросе несколько действий. Сначала уточни, какой список или статус проверить; отправку и изменения разберём отдельно.'};
 if(/(?:вчера|завтра|сегодня|неделю назад|за прошл|на следующ|к концу|на этой неделе)/iu.test(text))return {kind:'clarify',text:'Уточни период и что он означает: срок задачи, дата создания, изменение статуса или состояние на тот момент. Это разные выборки Jira.'};
 if(/(?:свободен|свободна|свободны|онлайн|в сети|в отпуске|сколько часов)/iu.test(text))return {kind:'clarify',text:'Назначенные задачи не подтверждают присутствие или свободное время коллег. Могу проверить распределение задач в Jira; для доступности нужны отдельные данные.'};
 if(/Jira ID:/iu.test(text))return {kind:'workload'};
 if(personalTasks(text))return {kind:'personal'};
 if(/(?:загруз|нагруз|команд|коллег|исполнител|у кого|на ком|по людям|кто чем|кто работает|кто отвечает|что делает|чем занят|что назначено|(?:задач|таск).*(?:\sу\s|назначен))/iu.test(text))return {kind:'workload'};
 if(/проект/iu.test(text)&&/(?:статус|как дела|что происходит|прогресс|что заверш|что осталось|блокер|заблокир|сколько|сводк|продвига|застрял|риск|срок|как ид[её]т|отч[её]т)/iu.test(text))return {kind:'status'};
 return null;
}
async function dispatch(route,command,handlers){
 if(!route)return null;
 if(route.kind==='action')return handlers.action?handlers.action(command,route):null;
 if(route.kind==='clarify')return {handled:true,question:true,text:route.text};
 if(!['personal','workload','status','chat'].includes(route.kind))throw Error('Неизвестный рабочий маршрут.');
 return handlers[route.kind](route.query||command,route);
}
module.exports={classify,dispatch};
