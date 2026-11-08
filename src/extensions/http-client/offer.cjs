// When to offer «API-клиент» to someone who has not added it.
module.exports={
 id:'http-client',name:'API-клиент',
 pitch:'отправлю HTTP-запрос прямо из чата и покажу ответ: статус, время, заголовки и JSON; запросы, меняющие данные, — только после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:postman|insomnia|curl|openapi|swagger|сваггер\p{L}*)(?=$|[^\p{L}])/iu],
 topics:[
  // «дерни GET https://…», «отправь POST на /login».
  /(?:^|[^A-Za-z])(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+(?:на\s+)?(?:https?:\/\/|\/)/u,
  /(?:дёрни|дерни|отправь|пошли|сделай|вызови)\p{L}*[^.?!]{0,30}(?:https?:\/\/|(?:^|\s)\/[a-z0-9_-]|запрос\p{L}* (?:на|к) (?:https?:|\/|api|апи|эндпоинт))/iu,
  /health-?check\p{L}*|healthcheck|хелс-?чек\p{L}*|хелсчек\p{L}*|(?:http|апи|api)-?запрос\p{L}*|эндпоинт\p{L}*/iu,
  /отвечает ли (?:staging|стейдж\p{L}*|стейджинг\p{L}*|прод\p{L}*|production|dev|дев\p{L}*|api|апи|бэкенд\p{L}*|сервер\p{L}*)/iu
 ],
 // An app's own API (Jira, Slack) is that app; explaining REST is a plain answer; «запрос в поддержку» is to people.
 avoid:[/jira|джир\p{L}*|confluence|slack|слак\p{L}*|asana|github|гитхаб|notion|sentry|как работает|что такое|объясни|поддержк\p{L}*|саппорт\p{L}*|(?:запрос|заявк)\p{L}* на (?:отпуск|доступ|оплат|ревью|встреч)/iu],
 requests:[/(?:дёрни|дерни|отправь|пошли|сделай|вызови|проверь|какой статус|покажи|отвечает ли|запроси)/iu],
 connect:'install',
 ready:settings=>settings['extension_http-client']==='true'
};
