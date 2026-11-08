const {ready}=require('./service-access.cjs');
function reply(command,topic,settings,skills=[]){
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'');
 const start=/^(?:что ты умеешь|что ты можешь|чем ты можешь помочь|какие у тебя возможности|расскажи о своих возможностях|расскажи,? чем (?:ты )?можешь помочь|какие (?:у тебя )?(?:есть )?(?:функции|навыки|скиллы))[.!?]*$/iu.test(text);
 const more=/^(?:а |и )?(?:ещ[её](?: что)?|что ещ[её]|что-нибудь ещ[её]|это вс[её]|вс[её]|больше ничего|что нет|ты тупой|ты меня понимаешь|ты повторяешься|покажи|покажи примеры|например|приведи пример|расскажи подробнее)[.!?]*$/iu.test(text);
 const messages=topic?.messages||[];
 let anchor=messages.findLastIndex(m=>m.role==='assistant'&&m.text===topic?.capabilityReply);
 if(anchor<0){const asked=messages.findLastIndex(m=>m.role==='user'&&/^(?:что ты умеешь|что ты можешь|какие у тебя возможности)[.!?]*$/iu.test(m.text));if(asked>=0&&messages[asked+1]?.role==='assistant')anchor=asked+1;}
 const continuation=/^(?:а |и )?(?:ещ[её](?: что)?|что ещ[её]|что-нибудь ещ[её]|это вс[её]|вс[её]|больше ничего|что нет|ты тупой|ты меня понимаешь|ты повторяешься|покажи|покажи примеры|например|приведи пример|расскажи подробнее)[.!?]*$/iu;
 const tail=messages.slice(anchor+1);
 const active=anchor>=0&&tail.length<=16&&tail.every((m,i)=>m.role==='user'?continuation.test(String(m.text).trim()):m.role==='assistant'&&i>0&&tail[i-1].role==='user');
 if(!start&&(!more||!active))return null;
 const examples=/^(?:покажи(?: примеры)?|например|приведи пример)[.!?]*$/iu.test(text);
 const repair=/^(?:что нет|ты тупой|ты меня понимаешь|ты повторяешься)[.!?]*$/iu.test(text);
 const page=start||repair?0:examples?1:Math.min(3,(topic.capabilityPage||0)+1);
 const connection=(id,label)=>label+(ready(id,settings)?' подключён':' нужно подключить');
 let answer;
 if(page===0)answer='Я помогаю с рабочими задачами:\n• Найти назначенные задачи, статусы проектов и распределение задач команды — по данным Jira.\n• Разобрать документы, код, логи и изображения, выделить ошибки и вопросы.\n• Нарисовать картинку по описанию локально — после установки модели изображений.\n• Извлечь поручения из встречи и подготовить план задач для проверки.\n• Подготовить отчёт и сообщение для отправки в выбранный Slack-канал.\n• Работать с Git выбранного проекта: изменения, ветки, коммиты, pull и push.\n• Выполнять и редактировать твои навыки.\n• Раздать сложную задачу агентам — несколько частей параллельно и общий ответ («раздай агентам: …»).\n• Помнить то, что ты отметил как важное, и присылать утреннюю сводку по будням.\n\n'+connection('jira','Jira')+'; '+connection('slack','Slack')+'. Доступ к данным зависит от подключения; чтение и выполнение действий подтверждаются результатом сервиса.';
 else if(page===1)answer='Вот примеры запросов:\n• «Какие задачи на мне?»\n• «Кто чем занят в проекте AA?» — укажи свой проект.\n• «Какие блокеры у проекта AA?»\n• «Разбери этот лог» — прикрепи файл.\n• «Выдели поручения из встречи» — добавь расшифровку.\nЕщё можно задавать обычные вопросы, просить перевести или отредактировать текст.';
 else if(page===2){const enabled=skills.filter(s=>s.enabled).slice(0,8);answer='У меня больше 150 встроенных навыков, в том числе из anthropics/skills и mattpocock/skills: баг-репорты, release notes, тест-кейсы, код-ревью, ретро, протоколы встреч, A/B-тесты, ответы на отзывы и другие. Подходящий выбираю сам, а «/имя» запускает нужный явно, например «/release-notes версия 1.19». Можно настроить и свои: создать навык с инструкциями или импортировать SKILL.md.'+(enabled.length?'\nСейчас включены: '+enabled.map(s=>'/'+s.name).join(', ')+'.':'\nВключённых навыков сейчас нет.')+'\nЯ не определяю присутствие и свободное время коллег по количеству задач и не выдаю сохранённые данные за свежую проверку.';}
 else answer='Основные возможности уже перечислены. Назови конкретную рабочую задачу — я объясню, какие данные нужны и как могу помочь.';
 if(repair)answer='Уточню: '+answer;
 return {handled:true,text:answer,capabilityPage:page};
}
function answer(command,topic,settings={},skills=[]){const result=reply(command,topic,settings,skills);if(result&&topic){topic.capabilityReply=result.text;topic.capabilityPage=result.capabilityPage;}return result;}
module.exports={reply,answer};
