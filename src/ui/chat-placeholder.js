// Suggestions are hints only: they never become submitted text or modify a draft.
(function(root){
 function chatPlaceholder(messages=[],result={}){
  const fallback='Напиши Пете...';
  const last=messages.filter(m=>m.role==='assistant').at(-1);
  if(result.error||!last?.text)return fallback;
  const answer=last.text;
  if(/не удалось|ошибка подключения|нет доступа|не подключ[её]н/iu.test(answer))return fallback;
  if(result.question||result.options?.length||result.topicChoices?.length)return fallback;
  const request=messages.filter(m=>m.role==='user').at(-1)?.text||'';
  if(/\b[A-Z][A-Z0-9]+-\d+\b/u.test(answer)||/задач[аиуы]|баг[аиов]/iu.test(answer)&&/задач|таск|баг|jira/iu.test(request)){
   if(/(?:найдено|найдены|всего|задач)[^\n]{0,20}\b0\b|задач[^\n]{0,20}нет/iu.test(answer))return 'Проверь задачи в другом статусе';
   return 'Какие из этих задач сделать сначала?';
  }
  if(/ошибк|не работает|падает|сбой/iu.test(request)&&/причин|исправ|провер/iu.test(answer))return 'Как проверить, что проблема исправлена?';
  if(/план|шаг[аиов]|рекомендац/iu.test(answer)&&/план|сделать|реализ|начать|решить/iu.test(request))return 'Разбери первый шаг подробнее';
  if(/встреч|обсуждени|сводк|отч[её]т|итог/iu.test(request)&&answer.length>120)return 'Выдели решения и следующие шаги';
  if(/сравн|вариант|подход/iu.test(request)&&answer.length>120)return 'Какой вариант выбрать и почему?';
  return fallback;
 }
 function applyChatPlaceholder(input,messages,result){
  const hint=chatPlaceholder(messages,result),suggestion=hint==='Напиши Пете...'?'':hint;
  input.dataset.suggestion=suggestion;input.placeholder=hint+(suggestion?' · Нажмите Tab чтобы использовать':'');
 }
 if(typeof module!=='undefined')module.exports={chatPlaceholder,applyChatPlaceholder};else {root.chatPlaceholder=chatPlaceholder;root.applyChatPlaceholder=applyChatPlaceholder;}
})(globalThis);
