// When to offer «Петя-наставник» to someone who has not added it.
// Neighbours: a mentor for a subject or for a junior (hiring, people), the day's plan (journal, calendar), the list of
// recurring commands («какие у меня повторы», Petya's own learning page), automating a build, CI or deploy (that system).
module.exports={
 id:'mentor',name:'Петя-наставник',
 pitch:'раз в неделю или по просьбе найду в истории чатов, что вы повторяете руками, и предложу расписание, скилл или приложение — всё остаётся на этом компьютере',
 names:[/пет[яюи][- ]наставник\p{L}*/iu],
 topics:[/что\s+(?:мне\s+)?(?:стоит\s+|можно\s+)?автоматизир\p{L}*/iu,/что\s+я\s+(?:делаю|повторяю|прошу)\s+(?:руками|вручную|постоянно|каждый\s+раз)/iu,/где\s+я\s+теряю\s+время/iu],
 avoid:[/автоматизир\p{L}*\s+(?:в|на|для)\s+(?!работе|пете|себе)|сборк|билд|(?:^|[^\p{L}])ci(?=$|[^\p{L}])|деплой|наставник\s+(?:по|для)|ментор|джун|стажер|стажёр|сегодня|повтор(?:ы|ов)\b/iu],
 requests:[/(?:что|где|покажи|найди)/iu],
 connect:'install',
 ready:settings=>settings.extension_mentor==='true'
};
