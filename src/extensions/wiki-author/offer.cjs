// When to offer «Вики из обсуждений» to someone who has not added it. Adding is enough: it reads the messengers and
// meeting summaries Petya already has and publishes where the user is connected (Confluence, Notion, Google Docs).
// Architecture decisions («ADR»), searching or reading the wiki, the meeting summary itself and sending messages are
// other apps' subjects.
module.exports={
 id:'wiki-author',name:'Вики из обсуждений',
 pitch:'оформлю итоги треда или встречи в вики-страницу — с дословными цитатами и ссылками и ответственным из «Команды»; сначала проверю, нет ли уже страницы на эту тему; опубликую в Confluence, Notion или Google Документы только после вашей кнопки',
 names:[],
 topics:[/(?:оформи|запиши|перенеси|сделай|собери|составь|задокументируй|опубликуй)\s+(?:\p{L}+\s+){0,4}?(?:вики|wiki|confluence|конфлюенс\p{L}*|notion|ноушн\p{L}*|баз[уе]\s+знаний)(?:[\s\S]{0,80}?)(?:тред\p{L}*|обсуждени\p{L}*|переписк\p{L}*|встреч\p{L}*|созвон\p{L}*)/iu,
  /(?:итоги|выводы|результаты)\s+(?:тред\p{L}*|обсуждени\p{L}*|переписк\p{L}*)\s+.{0,80}?\s+в\s+(?:вики|wiki|confluence|notion|базу\s+знаний)/iu],
 avoid:[/(?:^|[^\p{L}])(?:adr|архитектурн\p{L}*\s+решени\p{L}*)(?=$|[^\p{L}])|запиши\s+решени|найди|поищи|отправь|напиши\s+в\s+(?:слак|чат|тред)|что\s+в\s+вики/iu],
 requests:[/(?:оформи|запиши|перенеси|сделай|собери|составь|задокументируй|опубликуй)/iu],
 connect:'install',
 ready:settings=>settings['extension_wiki-author']==='true'
};
