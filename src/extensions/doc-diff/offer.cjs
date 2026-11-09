// When to offer «Что изменилось в документе» to someone who has not added it. Adding is enough: it reads the project's
// Markdown history, Confluence page versions and Google Docs revisions when those are connected.
// Changes in code, configs and balance, tasks, chats, meetings and the Drive's recent files are other apps' subjects;
// stale documentation is «Свежесть документации».
module.exports={
 id:'doc-diff',name:'Что изменилось в документе',
 pitch:'сравню версии документа — Confluence, Google Документы или Markdown в git — и покажу изменённые разделы с правками по словам, кто и когда их внёс, и короткую сводку только по настоящим правкам',
 names:[],
 topics:[/(?:поменял\p{L}*|изменил\p{L}*|изменени\p{L}*|правк\p{L}*|правил\p{L}*|менял\p{L}*)\s+(?:\p{L}+\s+){0,2}?(?:в|во|на)\s+(?:gdd|гдд|диздок\p{L}*|геймдизайн\p{L}*|спек\p{L}*|спецификаци\p{L}*|документ\p{L}*|страниц\p{L}*|вики|readme|ридми)/iu,
  /сравни\s+(?:\p{L}+\s+){0,2}?(?:gdd|гдд|спек\p{L}*|спецификаци\p{L}*|документ\p{L}*|страниц\p{L}*|readme)\p{L}*\s+(?:\p{L}+\s+){0,3}?с\s+(?:прошл|предыдущ|прежн|стар)\p{L}*\s+(?:верси|ревизи|редакци)/iu,
  /(?:истори\p{L}*\s+(?:изменений|правок|версий)|кто\s+(?:менял|правил|редактировал))\s+(?:\p{L}+\s+)?(?:gdd|гдд|спек\p{L}*|документ\p{L}*|страниц\p{L}*)/iu],
 avoid:[/(?:^|\s)(?:код\p{L}*|репозитори\p{L}*|коммит\p{L}*|ветк\p{L}*|баланс\p{L}*|конфиг\p{L}*|задач\p{L}*|спринт\p{L}*|тред\p{L}*|чат\p{L}*|встреч\p{L}*|диск\p{L}*|таблиц\p{L}*)(?=$|[^\p{L}])|устарел|свежест|актуальн/iu],
 requests:[/(?:что|какие|кто|сравни|покажи|история)/iu],
 connect:'install',
 ready:settings=>settings['extension_doc-diff']==='true'
};
