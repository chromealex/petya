function queryText(text){if(text.length>500)throw Error('Сформулируйте короткий поисковый запрос до 500 символов.');if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:api[_ -]?key|token|password|пароль|секрет|токен)\s*[:=]\s*\S+|\b(?:sk-|ghp_|xox[baprs]-)[\w-]+|https?:\/\/\S+[?@]/i.test(text))throw Error('В запросе есть адрес почты, ключ или ссылка с параметрами. Уберите личные данные и повторите.');return text.trim();}
// Questions that cannot be answered without current data: weather, exchange rates, quotes, news.
// Definitions («что такое курс») and work news («новости по проекту») are not web searches.
function freshQuestion(command){
 const s=String(command||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'');
 if(/^(?:а\s+)?(?:что такое|что значит|объясни|почему|как работает|как устроен|не\s)/iu.test(s)||/[«"“]/u.test(s))return null;
 if(/(?:погод[аеуы]|прогноз погоды|температур\p{L}* (?:на улице|в|за окном))/iu.test(s)||/(?:курс\p{L}* (?:доллар|евро|рубл|юан|валют|биткоин|bitcoin|btc|eth)|котировк|стоимость (?:акци|биткоин))/iu.test(s))return s.replace(/[?!.]+$/u,'');
 if(/новост/iu.test(s)&&!/(?:проект|задач|команд|релиз|спринт|slack|слак|телеграм|telegram|почт|канал|jira|джир)/iu.test(s))return s.replace(/[?!.]+$/u,'');
 return null;
}
function searchCommand(command,topic){const explicit=/^(?:найди|поищи|посмотри|проверь|найти)(?:\s+мне)?\s+(?:в интернете|в сети|в гугле|в google)(?:\s*[:,—-]\s*|\s+)?(.*)$/iu.exec(command)||/^(?:загугли|погугли)\s+(.*)$/iu.exec(command);if(explicit)return {query:explicit[1]||'',fresh:true};const fresh=freshQuestion(command);if(fresh)return {query:fresh,fresh:true,implicit:true};if(topic?.webQuery&&/^(?:а (?:для|на|если|как|что)|покажи другой способ|найди другой способ|обнови(?: ответ)?$)/iu.test(command))return {query:topic.webQuery+' '+command,fresh:false};return null;}
class WebSearch{
 constructor({enabled,model,read,searchAPI}){Object.assign(this,{enabled,model,read,searchAPI});this.busy=false;}
 async search(raw,{resume=false}={}){if(!this.enabled())throw Error('Включите модуль «Поиск в интернете» в «Подключениях».');const query=require('./web-fallback.cjs').query(queryText(raw))||queryText(raw);if(!query)throw Error('Что найти в интернете? Произнесите команду вместе с вопросом.');if(this.busy)throw Error('Дождитесь текущего поиска.');this.busy=true;
 try{const links=await this.searchAPI(query,resume);if(!links.length)throw Error('Поисковик не вернул доступные результаты или запросил проверку. Попробуйте позже или уточните вопрос.');
  const pages=[];
  // Read up to three independent sources together; preserve search ranking.
  for(let offset=0;offset<links.length&&pages.length<3;){
   if(!this.enabled())throw Error('Модуль поиска выключен.');
   const batch=links.slice(offset,offset+3-pages.length);offset+=batch.length;
   const results=await Promise.all(batch.map(async link=>{
    if(!this.enabled())return null;
    // The results page itself (Google's own answer and snippets) comes with its text; it is not read again.
    if(link.text)return link.text.length>=150?{...link,text:link.text.slice(0,10000)}:null;
    try{const page=await this.read(link.url,{enabled:this.enabled});const text=page.text.slice(0,10000);return text.length>=150?{...link,url:page.url,text}:null;}catch{return null;}
   }));
   pages.push(...results.filter(Boolean));
  }
  if(!this.enabled())throw Error('Модуль поиска выключен.');if(!pages.length)return {query,text:'Нашёл ссылки, но прочитать страницы не удалось. Проверенного ответа пока нет.',sources:links,verified:false};
  let answer;try{const r=await this.model(query,pages);if(!this.enabled())throw Error('Модуль поиска выключен.');if(!r||typeof r.answer!=='string'||!r.answer.trim()||!Array.isArray(r.sources)||!r.sources.length||r.sources.some(i=>!Number.isInteger(i)||i<1||i>pages.length))throw Error('Неверные ссылки');answer=r.answer.slice(0,7000);return {query,text:answer+'\nПроверено '+new Date().toLocaleString('ru-RU')+'.'+(pages.length===1?' Удалось прочитать только один источник.':''),sources:[...new Set(r.sources)].map(i=>({title:'['+i+'] '+pages[i-1].title,url:pages[i-1].url})),verified:true};}
  catch{return {query,text:'Страницы найдены и прочитаны, но локальная модель не смогла подготовить ответ. Откройте источники ниже.',sources:pages.map(({title,url})=>({title,url})),verified:false};}
 }finally{this.busy=false;}}
}
module.exports={freshQuestion,WebSearch,queryText,searchCommand};
