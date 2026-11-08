// When to offer «Поиск по всему»: a search everywhere («найди везде про …», «поиск по всему», «где обсуждали …»).
// Not this: the internet (web search), a spreadsheet (Google Sheets), a file or folder by name, a person who knows a
// subject («Кто знает»), a single named service («найди в Confluence» is «Документы»).
const Q=require('./query.cjs');
module.exports={
 id:'search-all',name:'Поиск по всему',
 pitch:'один вопрос — поиск сразу по Slack, Jira, Confluence и Notion, почте, Telegram, встречам и файлам проекта, с ответом по найденному',
 names:[],
 topics:[Q.SEARCH],
 avoid:[Q.AVOID,/(?:^|[^\p{L}])(?:что\s+такое|как\s+работает)(?=$|[^\p{L}])/iu],
 requests:[/(?:найди|найти|поищи|ищи|искать|поиск|где)/iu],
 connect:'install',
 ready:settings=>settings['extension_search-all']==='true'
};
