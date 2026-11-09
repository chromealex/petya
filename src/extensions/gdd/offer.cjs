// When to offer «Геймдизайн-документ» to someone who has not added it. Adding is enough: the GDD is Markdown in the
// project, or a Confluence page / Google Doc of the connections Petya already has.
// What changed in the GDD («Что изменилось в документе»), stale docs, ADRs, balance checks against configs
// («Конфиги и баланс») and definitions are not it.
module.exports={
 id:'gdd',name:'Геймдизайн-документ',
 pitch:'опишу или обновлю раздел GDD по чату, сводкам встреч, эпикам Jira и конфигам — каждое число со ссылкой на файл и строку, остальное помечу «уточнить»; запишу в GDD только после того, как вы проверите разницу; подскажу, каких систем в GDD нет',
 names:[/(?:^|[^\p{L}])(?:gdd|гдд|геймдизайн[\s-]*документ\p{L}*|диздок\p{L}*)(?=$|[^\p{L}])/iu],
 topics:[/(?:обнови|актуализируй|перепиши)\s+раздел\p{L}*\s+.{2,60}?\s+по\s+(?:текущ\p{L}*\s+|наш\p{L}*\s+|актуальн\p{L}*\s+)?конфиг\p{L}*/iu],
 avoid:[/что\s+такое|поменял|изменил|правк|верси|устарел|свежест|актуальност|(?:^|\s)adr(?=$|\s)|решени\p{L}*\s*:|свер\p{L}*\s+баланс|шаблон/iu],
 requests:[/(?:опиши|распиши|обнови|дополни|допиши|добавь|напиши|составь|актуализируй|чего\s+не\s+хватает|каких|какие|не\s+описан)/iu],
 connect:'install',
 ready:settings=>settings.extension_gdd==='true'
};
