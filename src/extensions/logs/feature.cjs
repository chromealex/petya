// «Логи сервера»: server logs in the chat — entries coloured by level, a histogram over time, error signatures
// grouped with counts and first/last seen, «Почему?» grounded in the lines, «Создать задачу» through the task
// tracker link, «Открыть в Grafana/Kibana». Source-agnostic: logs come from `log-source` providers
// (src/features/log-sources.cjs; Loki and Elasticsearch/OpenSearch in this directory, Kubernetes pod logs in
// «Kubernetes»). The local model writes the query in the source's language under a strict schema; the registry
// validates and bounds it (period, number of lines, read-only endpoints). Nothing here writes anywhere.
const kit=require('../app-kit.cjs');
const L=require('../../features/log-sources.cjs');
const http=require('./http.cjs');
const {ask}=require('../../input-required.cjs');
const ID='logs',BY='Логи сервера';
const registry=s=>s.logSources||L.create(s);

// --- Routing -------------------------------------------------------------------------------------------------
const LOGS=/(?:^|[^\p{L}])(?:лог(?:и|ов|ам|ах|а|е)?|logs?|логам|логах)(?=$|[^\p{L}])/iu;
const SERVER=/сервер\p{L}*|бэкенд\p{L}*|бекенд\p{L}*|(?:^|[^\p{L}])(?:backend|api|прод(?:е|а|у)?|production|prod|staging|стейдж\p{L}*|стенд\p{L}*|сервис\p{L}*|микросервис\p{L}*|приложени\p{L}* на сервере)(?=$|[^\p{L}])/iu;
const SOURCE=/(?:^|[^\p{L}])(?:loki|локи|grafana|графан\p{L}*|kibana|кибан\p{L}*|elastic(?:search)?|эластик\p{L}*|opensearch|опенсерч\p{L}*|elk|logql|kql|kubernetes|k8s|кубер\p{L}*|под(?:а|ов|ы|ах)|pods?)(?=$|[^\p{L}])/iu;
// Neighbours: Docker containers, CI build logs, Unity/editor logs, git log, chat and Slack logs, sign-in,
// monitoring (alerts, server health, metrics) and logistics are not this.
const AVOID=/docker|докер|контейнер|compose|(?:^|[^\p{L}])ci(?=$|[^\p{L}])|сборк|билд|build|pipeline|пайплайн|github actions|unity|юнити|editor|редактор|(?:^|[^\p{L}])git(?=$|[^\p{L}])|коммит|чат\p{L}*|слак|slack|телеграм|звонк|встреч|логин|логист|логарифм|алерт|alert|(?:^|[^\p{L}])(?:redis|редис|postgres|постгрес|mysql|mongo|nginx|kafka|rabbitmq|clickhouse)(?=$|[^\p{L}])/iu;
const ERRORS=/ошиб\p{L}*|исключени\p{L}*|(?:^|[^\p{L}])(?:errors?|exceptions?|5\d\d)(?=$|[^\p{L}\d])|падени\p{L}*|предупрежд\p{L}*/iu;
const PERIOD=/за\s+(?:последн\p{L}*\s+)?(?:\d{1,3}\s*)?(?:минут\p{L}*|час\p{L}*|сутки|сут\p{L}*|дн\p{L}*|день|недел\p{L}*)|сегодня|вчера|полчаса/iu;
const lastBy=s=>{try{const m=s.dialogue?.active?.()?.messages||[];for(let i=m.length-1;i>=0;i--)if(m[i].role==='assistant')return m[i].by;}catch{/* no chat */}return '';};
function about(text,s){
 const t=String(text||'');
 if(AVOID.test(t))return false;
 if(LOGS.test(t))return SERVER.test(t)||SOURCE.test(t)||ERRORS.test(t)||PERIOD.test(t)||/(?:покажи|открой|глянь|посмотри|найди|поищи|что в|выведи)/iu.test(t);
 // «что в Loki за час», «ошибки в Кибане».
 if(/(?:^|[^\p{L}])(?:loki|локи|kibana|кибан\p{L}*|opensearch|logql|kql)(?=$|[^\p{L}])/iu.test(t))return true;
 // «ошибки на проде за час», and follow-ups right after a logs card («а за сутки?», «только payments»).
 if(ERRORS.test(t)&&/(?:на|в)\s+(?:прод\p{L}*|сервер\p{L}*|бэкенд\p{L}*|бекенд\p{L}*|backend|api|staging|стейдж\p{L}*)/iu.test(t))return true;
 if(lastBy(s)===BY&&t.length<120&&(ERRORS.test(t)&&PERIOD.test(t)||/^(?:а\s+)?(?:за|только|без|теперь|ещё|еще)\s/iu.test(t)))return true;
 return false;
}

// --- Settings -------------------------------------------------------------------------------------------------
const SECRET=/^[\x21-\x7e]{8,4000}$/;
function validate(next){
 for(const key of ['logsLokiUrl','logsGrafanaUrl','logsElasticUrl','logsKibanaUrl']){
  if(next[key]===undefined)continue;
  const v=String(next[key]||'').trim();
  if(v&&!http.base(v))throw Error('Адрес «'+v.slice(0,80)+'» не подходит: нужен http(s)-адрес без логина, пароля и параметров.');
  next[key]=v?http.base(v):'';
 }
 if(next.logsLokiSelector!==undefined){const v=String(next.logsLokiSelector||'').trim();if(v&&!L.validateLogQL(v).ok)throw Error('Селектор Loki по умолчанию должен быть селектором потока, например {env="prod"}.');next.logsLokiSelector=v;}
 if(next.logsLokiServiceLabel!==undefined){const v=String(next.logsLokiServiceLabel||'').trim();if(v&&!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(v))throw Error('Метка сервиса в Loki — латиница, цифры и «_».');next.logsLokiServiceLabel=v;}
 if(next.logsElasticIndex!==undefined){const v=String(next.logsElasticIndex||'').trim();if(v&&!require('./elasticsearch-source.cjs').INDEX.test(v))throw Error('Индекс — строчные латинские буквы, цифры, «*», «-», «_», «.» и запятые, например logs-*.');next.logsElasticIndex=v;}
 for(const key of ['logsLokiToken','logsElasticKey']){if(next[key]===undefined)continue;const v=String(next[key]||'').trim();if(v&&!SECRET.test(v))throw Error('Ключ указан неверно: без пробелов и переносов строк.');next[key]=v;}
 for(const key of ['logsLokiUser','logsLokiTenant','logsElasticUser','logsGrafanaDatasource']){if(next[key]===undefined)continue;const v=String(next[key]||'').trim();if(v&&!/^[\w.@:+-]{1,200}$/.test(v))throw Error('Значение «'+v.slice(0,40)+'» содержит недопустимые символы.');next[key]=v;}
 if(next.logsDefaultSource!==undefined&&!/^[a-z0-9-]{0,40}$/.test(String(next.logsDefaultSource)))throw Error('Неизвестный источник логов.');
}

// --- Turn -------------------------------------------------------------------------------------------------------
const plural=kit.plural;
const RANGE_WORDS={'15m':'за последние 15 минут','30m':'за последние 30 минут','1h':'за последний час','3h':'за последние 3 часа','6h':'за последние 6 часов','12h':'за последние 12 часов','24h':'за сутки','1d':'за сутки','2d':'за двое суток','3d':'за трое суток','7d':'за неделю'};
function rangeLabel(spec){
 const ms=Date.parse(spec.range.to)-Date.parse(spec.range.from);
 const h=Math.round(ms/3600e3);
 if(ms<3600e3)return 'за последние '+Math.round(ms/60e3)+' '+plural(Math.round(ms/60e3),['минуту','минуты','минут']);
 if(h===1)return RANGE_WORDS['1h'];if(h===24)return RANGE_WORDS['24h'];if(h===168)return RANGE_WORDS['7d'];
 return h<48?'за последние '+h+' '+plural(h,['час','часа','часов']):'за '+Math.round(h/24)+' '+plural(Math.round(h/24),['день','дня','дней']);
}
function summary(r){
 const label=rangeLabel(r.spec);
 const where=r.source.name+(r.spec.filters.services.length?' ('+r.spec.filters.services.join(', ')+')':'');
 if(!r.entries.length)return where+': '+label+' ничего не нашлось'+(r.spec.query?' по запросу':'')+'.';
 const errors=r.histogram.exact?r.histogram.buckets.reduce((a,b)=>a+b.errors,0):r.entries.filter(e=>e.level==='error'||e.level==='fatal').length;
 const head=where+' '+label+': '+r.total.toLocaleString('ru-RU')+' '+plural(r.total,['строка','строки','строк'])+(errors?', ошибок '+errors.toLocaleString('ru-RU'):', ошибок нет')+'.';
 const g=r.groups[0];
 return head+(g?' Чаще всего: «'+g.signature.slice(0,140)+'» — '+g.count+' '+plural(g.count,['раз','раза','раз'])+(r.groups.length>1?', всего видов ошибок: '+r.groups.length:'')+'.':'');
}
function card(r,{by,request}){
 const cut=(v,n)=>String(v||'').slice(0,n);
 return {source:r.source,request:cut(request,300),by,spec:{language:r.spec.language,query:r.spec.query,range:r.spec.range,limit:r.spec.limit,filters:r.spec.filters},
  entries:r.entries.slice(0,300).map(e=>({ts:e.ts,level:e.level,service:e.service,message:cut(e.message,1200),labels:e.labels})),
  histogram:r.histogram,groups:r.groups.slice(0,12).map(g=>({...g,signature:cut(g.signature,240),samples:g.samples.slice(0,3).map(x=>cut(x,600))})),
  total:r.total,truncated:r.truncated,notes:r.notes,explore:r.explore,at:Date.now()};
}
function connectText(){return 'Источник логов не подключён. Откройте Настройки → «Логи сервера» и укажите адрес Loki или Elasticsearch/OpenSearch (или добавьте «Kubernetes» для логов подов) — потом повторите вопрос.';}

async function logsTurn(s,command,opts={}){
 const reg=registry(s);
 const ready=reg.list();
 if(!ready.length)return kit.reply(s,command,{by:BY,question:true,text:connectText()});
 const named=reg.named(command).filter(id=>ready.some(x=>x.id===id));
 const id=opts.source||named[0]||(ready.length===1?ready[0].id:ready.find(x=>x.id===s.settings.logsDefaultSource)?.id);
 if(!id)return ask({text:'Где смотреть логи?',label:'Источник логов',options:ready.map(x=>x.name)},answer=>logsTurn(s,command,{...opts,source:(ready.find(x=>x.name===String(answer).trim())||ready[0]).id}));
 const x=ready.find(r=>r.id===id);
 const parsed=L.parse(command,new Date());
 let raw={levels:parsed.levels,services:parsed.services,contains:parsed.contains,range:parsed.range,query:''},by='code';
 if(s.settings.model){
  s.requestProgress?.report?.('Составляю запрос к '+x.name);
  const m=await reg.translate(id,command).catch(()=>null);
  if(m){
   by='model';
   // Service names the model did not read in the request are dropped: it must not invent them.
   const services=[...new Set([...parsed.services,...(m.services||[]).filter(v=>String(command).toLowerCase().includes(String(v).toLowerCase()))])];
   const levels=m.levels?.length?m.levels:parsed.levels;
   raw={query:m.query,levels:levels.includes('error')&&!levels.includes('fatal')?[...levels,'fatal']:levels,services,contains:m.contains?.length?m.contains:parsed.contains,range:parsed.period?parsed.range:m.range,limit:m.limit};
   // The query must name the same services: otherwise it is rebuilt from the filters.
   if(services.length&&raw.query&&!services.every(v=>raw.query.includes(v)))raw.query='';
   if(!services.length&&parsed.services.length===0&&raw.query&&x.language==='logql'&&/\{[^}]*(?:service|app|job)/.test(raw.query)&&!/=~?"\.\+"/.test(raw.query))raw.query='';
  }
 }
 if(opts.services)raw.services=opts.services;
 s.requestProgress?.report?.('Читаю логи '+x.name);
 let r;
 try{r=await reg.search(id,raw);}
 catch(e){
  if(e?.need==='service'){
   let options=[];try{options=await reg.services(id,raw);}catch{options=[];}
   return ask({text:'Логи какого сервиса показать?',label:'Сервис',options:options.slice(0,8),placeholder:'имя сервиса или деплоймента'},answer=>logsTurn(s,command,{...opts,source:id,services:[String(answer).trim()]}));
  }
  return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'Источник недоступен.')});
 }
 return kit.reply(s,command,{by:BY,text:summary(r),data:{logs:card(r,{by,request:command})}});
}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!about(text,s))return null;
 return logsTurn(s,text);
}

// --- Card calls -------------------------------------------------------------------------------------------------
const WHY={type:'object',additionalProperties:false,properties:{cause:{type:'string'},explanation:{type:'string'},evidence:{type:'array',items:{type:'string'},maxItems:4},steps:{type:'array',items:{type:'string'},maxItems:4}},required:['cause','explanation','evidence','steps']};
// «Почему?» for one error signature: the model sees only the group's lines and nearby lines from the card and must
// quote them; quotes that are not in the lines are dropped.
async function why(s,group,context=[]){
 if(!s.settings.model)throw Error('Для объяснения нужна локальная модель: выберите её в настройках.');
 const lines=[...(Array.isArray(group?.samples)?group.samples:[]),...(Array.isArray(context)?context:[])].map(v=>String(v||'').slice(0,800)).filter(Boolean).slice(0,40);
 if(!lines.length)throw Error('Нет строк, по которым можно объяснить.');
 const answer=await kit.modelJSON(s,{system:'Ты помогаешь понять ошибку в логах сервера. Опирайся только на строки логов из данных. Не выдумывай причин, которых нет в строках; если строк мало для вывода — так и скажи. cause — причина одной фразой, explanation — 2–3 предложения, evidence — дословные фрагменты строк, на которые опираешься, steps — что проверить. По-русски.',
  user:{signature:String(group?.signature||'').slice(0,300),count:Number(group?.count)||0,services:(group?.services||[]).slice(0,6),first:group?.first,last:group?.last,lines},schema:WHY,predict:900});
 if(!answer)throw Error('Модель не ответила. Повторите.');
 const all=lines.join('\n');
 return {cause:String(answer.cause||'').slice(0,300),explanation:String(answer.explanation||'').slice(0,900),
  evidence:(answer.evidence||[]).map(v=>String(v).trim()).filter(q=>q.length>3&&all.includes(q)).slice(0,4),steps:(answer.steps||[]).map(v=>String(v).slice(0,240)).slice(0,4)};
}
function setup(s){
 return {ipc:{
  status:()=>({sources:registry(s).all(),hasLokiToken:!!s.settings.logsLokiToken,hasElasticKey:!!s.settings.logsElasticKey}),
  why:(group,context)=>why(s,group,context),
  // «Проверить подключение»: the last 15 minutes, one line, from each ready source.
  async check(){
   const out=[];
   for(const x of registry(s).list()){
    if(x.id==='kubernetes')continue;
    try{const r=await registry(s).search(x.id,{range:{last:'15m'},limit:1});out.push({id:x.id,name:x.name,ok:true,total:r.total});}
    catch(e){out.push({id:x.id,name:x.name,ok:false,error:e.message});}
   }
   if(!out.length)throw Error('Сначала сохраните адрес Loki или Elasticsearch.');
   return out;
  }
 }};
}
module.exports={name:'logsApp',
 defaults:{['extension_'+ID]:'false',logsDefaultSource:'',logsLokiUrl:'',logsLokiUser:'',logsLokiToken:'',logsLokiTenant:'',logsLokiSelector:'',logsLokiServiceLabel:'',logsGrafanaUrl:'',logsGrafanaDatasource:'',
  logsElasticUrl:'',logsElasticIndex:'',logsElasticUser:'',logsElasticKey:'',logsKibanaUrl:''},
 secrets:['logsLokiToken','logsElasticKey'],validate,setup,turn,about,logsTurn,summary,why,card};
