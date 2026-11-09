// When to offer «Свежесть документации» to someone who has not added it. Adding is enough: it reads the project's
// repository (Confluence and Google Docs when those are connected).
// Outdated packages and dependencies, deprecated APIs in code, writing or updating docs, finding docs on a topic and
// fresh news are not it.
module.exports={
 id:'doc-freshness',name:'Свежесть документации',
 pitch:'найду в документации проекта упоминания файлов, кода, настроек и версий, которых больше нет или которые поменялись после правки документа, — со строкой документа и коммитом рядом; правки и задачи только по вашей кнопке',
 names:[],
 topics:[/(?:устаревш\p{L}*|устарел\p{L}*|неактуальн\p{L}*|протух\p{L}*|свежест\p{L}*|актуальност\p{L}*)\s+(?:\p{L}+\s+){0,2}?(?:документац|доки|доков|доку|readme|ридми)/iu,
  /(?:документац\p{L}*|доки|readme|ридми)\s+(?:\p{L}+\s+){0,2}?(?:устарел|неактуальн|протух)/iu],
 avoid:[/пакет|зависимост|библиотек|npm|nuget|sdk|плагин|api\s+в\s+коде|обнови\s+документ|напиши\s+документ|новост/iu],
 requests:[/(?:провер|найди|покажи|какая|какие|что|где|есть\s+ли)/iu],
 connect:'install',
 ready:settings=>settings['extension_doc-freshness']==='true'
};
