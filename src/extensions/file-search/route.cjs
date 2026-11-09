// Which requests are a search for the user's own files by meaning, and what to search for.
// «где презентация про Китай с графиком LTV?», «найди скрипт, который сохраняет прогресс», «документы про
// монетизацию». Not: the web («найди в интернете»), «search everything» («поиск по всему»), trackers, wikis,
// messengers and mail, chat history, disk space, conversion, or asking to write code.
const VERB=/(?:^|[^\p{L}])(?:найди|найти|найдёшь|найдешь|поищи|поиск|ищу|ищем|отыщи|разыщи|покажи|подбери|где(?=[^\p{L}]|$)|в как(?:ом|их) файл\p{L}*|как(?:ой|ие) файл\p{L}*|есть ли у (?:меня|нас) (?:файл|документ|презентаци|скрипт))/iu;
// What is being looked for: a file or something that lives in files.
const OBJECT=/(?:^|[^\p{L}])(?:файл\p{L}*|документ(?!аци)\p{L}*|док(?:и|ах|ом)?|презентаци\p{L}*|презу|през(?:ы|ах)?|слайд\p{L}*|скрипт\p{L}*|исходник\p{L}*|класс(?:а|ы|е)?|функци(?:я|ю|и)|таблиц\p{L}*|pdf|пдф\p{L}*|docx|pptx|xlsx|заметк\p{L}*|конспект\p{L}*|конфиг\p{L}*|readme|ридми|текст(?:ы|ах)? про|по смыслу)(?=$|[^\p{L}])/iu;
// «Документы про монетизацию»: a plural kind of file and what it is about, without a verb.
const BARE=/^(?:все\s+|мои\s+|наши\s+)?(?:документы|файлы|презентации|презы|скрипты|заметки|таблицы|доки|pdf)\s+(?:про|о|об|по|насчёт|насчет|с|со|где|в которых|которые)\s+\S/iu;
// Someone else's subject (see docs/apps/file-search.md for the neighbours).
const AVOID=[
 /в интернете|в сети(?!\p{L})|в гугле|в google(?! ?drive)|в яндексе|в вебе|онлайн|на сайте|в браузере|в википедии/iu,     // web search
 /по всему(?!\p{L})|везде|во всём|во всем|всюду|по всем источникам/iu,                                       // search everything
 /jira|джир\p{L}*|задач\p{L}*|тикет\p{L}*|(?:^|[^\p{L}])баг\p{L}*|issue|в трекере|asana|асан\p{L}*/iu,          // trackers
 /confluence|конфлюенс\p{L}*|notion|ноушн\p{L}*|google ?drive|гугл[- ]?диск\p{L}*|яндекс[- ]?диск\p{L}*|dropbox/iu, // wikis and clouds
 /(?:в|из) (?:слак|slack|телеграм|telegram|почт|письм|дискорд|discord)|в переписке|в чате|в истории чат/iu,   // messengers, mail, chats
 /мест[оа](?!\p{L})|занима\p{L}*|тяж[её]л\p{L}*|больш\p{L}* файл|забит\p{L}*|весит|размер\p{L}*|дубликат\p{L}*/iu, // disk space
 /конверт\p{L}*|сожми|сжать|переведи|гифк\p{L}*/iu,                                                         // converter
 /(?:^|[^\p{L}])(?:напиши|исправь|допиши|создай|сделай|удали|переименуй|перенеси|скопируй)(?=$|[^\p{L}])/iu, // writing or changing files
 /документаци\p{L}* (?:по|к|для) (?:unity|юнити|unreal|python|react|node|swift|kotlin|android|ios|api)/iu,  // product docs on the web
 /коммит\p{L}*|(?:^|[^\p{L}])pr(?:$|[^\p{L}])|пулл?-?реквест\p{L}*/iu,                                      // git history and PRs
 /схем\p{L}* таблиц|(?:^|[^\p{L}])(?:sql|бд|clickhouse|postgres\p{L}*|bigquery)(?=$|[^\p{L}])|в баз\p{L}* данных|колонк\p{L}*|столбц\p{L}*/iu, // database tables (SQL app)
 /гугл[- ]?таблиц\p{L}*|google ?sheets?|docs\.google\.com|spreadsheet/iu                                // Google Sheets app
];

// What kind of file the request names, as the index's file kinds (meta.type): a soft preference, not a filter.
const KINDS=[[/презентаци|презу|през(?:ы|ах)?(?![\p{L}])|слайд/iu,['slides','pdf']],[/скрипт|исходник|класс|функци|код(?!\p{L})|конфиг/iu,['code']],[/таблиц|xlsx/iu,['sheet']],[/pdf|пдф/iu,['pdf']],[/заметк|конспект|readme|ридми/iu,['markdown','text']],[/документ|док(?:и|ах|ом)?(?![\p{L}])|docx/iu,['doc','pdf','markdown','text']]];

function wanted(command){
 const text=String(command||'').trim();
 if(!text||text.length>400)return null;
 if(/^(?:а\s+)?(?:что такое|как (?:работает|настроить|подключить)|зачем)/iu.test(text))return null;
 if(AVOID.some(r=>r.test(text)))return null;
 const direct=VERB.test(text)&&OBJECT.test(text),bare=BARE.test(text);
 if(!direct&&!bare)return null;
 return {query:query(text),kinds:kinds(text)};
}
// The description to embed: the request without the search verb, politeness and «on my computer».
function query(text){
 let q=String(text).replace(/[«»"“”]/g,' ');
 q=q.replace(/(?:^|[\s,])(?:пожалуйста|плиз|пж|петя|мне|у меня|у нас|по смыслу|на (?:компьютере|компе|маке|диске|ноуте|ноутбуке)|в (?:моих|наших) (?:папках|файлах)|в (?:папке|папках) проекта|в проекте)(?=$|[\s,.!?])/giu,' ');
 q=q.replace(/\s+,/g,',').replace(/,(?:\s*,)+/g,',');
 q=q.replace(/^\s*(?:а\s+)?(?:найди|найти|поищи|ищу|ищем|отыщи|разыщи|покажи|подбери|где(?:\s+(?:лежит|лежат|был|была|было|были|мой|моя|моё|мое|мои|наш|наша|наши))?|в как(?:ом|их) файл\p{L}*|как(?:ой|ие) файл\p{L}*)[\s,]+/iu,'');
 q=q.replace(/\s+/g,' ').replace(/^[\s,.:;!?-]+|[\s?!.]+$/g,'').trim();
 return q||String(text).trim();
}
function kinds(text){for(const [re,list] of KINDS)if(re.test(text))return list;return [];}

module.exports={wanted,query,kinds,VERB,OBJECT,BARE,AVOID};
