// «Учёт времени»: where the day went, from the activity tracker (src/features/activity.cjs, opt-in, local only).
// Day timeline in four categories (work, meetings, communication, other — the user changes an app's category in the
// card), totals, time by app / project / task, meetings from «Календарь» and focus sessions of «Фокус» over the
// timeline, CSV export, and «Записать время в Jira» (worklogs) only after a preview the user confirms in the card.
// No model: the answer is counted by code. The tracker is switched on only by the user (settings or the question
// in the chat); this app never turns it on by itself.
const fs=require('node:fs');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const period=require('./period.cjs');
const categories=require('./categories.cjs');
const overlay=require('./overlay.cjs');
const worklogs=require('./worklog.cjs');
const {isBrowser}=require('../../activity/redact.cjs');
const ID='time-tracking',BY='Учёт времени',MIN=60000;

// --- Routing --------------------------------------------------------------------------------------------------------
const TOPIC=[
 /на\s+что\s+(?:у\s+меня\s+)?(?:ушл?[оаи]?|ушёл|уш[её]л|потратил\p{L}*|тратил\p{L}*|убил\p{L}*)\s+(?:мо[йяё]\s+|весь\s+|вся\s+|сегодняшн\p{L}*\s+|вчерашн\p{L}*\s+)?(?:день|время|недел\p{L}*|утро|вечер)/iu,
 /на\s+что\s+(?:я\s+)?(?:сегодня\s+|вчера\s+)?(?:потратил|тратил|убил)\p{L}*\s+(?:сегодня\s+|вчера\s+)?(?:время|день)/iu,
 /куда\s+(?:у\s+меня\s+)?(?:ушл[оаи]|уходит|утекл[оаи]|делось|делся)\s+(?:мо[ёея]\s+|всё\s+|весь\s+)?(?:время|день|недел\p{L}*)/iu,
 /уч[её]т\p{L}*\s+(?:моего\s+|рабочего\s+)?времени|трекинг\p{L}*\s+времени|тайм-?трекинг\p{L}*|time\s*tracking/iu,
 /сколько\s+(?:времени\s+|часов\s+|минут\s+)?(?:я\s+)?(?:сегодня\s+|вчера\s+|на\s+этой\s+неделе\s+|за\s+неделю\s+)?(?:я\s+)?(?:сидел\p{L}*|просидел\p{L}*|провёл|провел\p{L}*|проторчал\p{L}*|работал\p{L}*|потратил\p{L}*|был\p{L}*)\s+(?:сегодня\s+|вчера\s+)?(?:в|во|на|над)\s+\S+/iu,
 /сколько\s+(?:времени|часов)\s+(?:у\s+меня\s+)?(?:ушло|уходит|ушло\s+у\s+меня)\s+на\s+\S+/iu,
 /время\s+по\s+(?:задачам|проектам|приложениям|категориям)|(?:время|часы)\s+(?:в|по)\s+разрезе\s+(?:задач|проектов)/iu,
 /(?:таймлайн|хронологи\p{L}*|лент\p{L}*)\s+(?:моего\s+)?(?:дня|активности|времени)/iu,
 /(?:запиши|записать|залогируй|залогировать|спиши|списать|внеси|внести|занеси)\s+(?:моё\s+|мое\s+)?(?:время|часы|ворклог\p{L}*)\s+(?:в|во)\s+(?:jira|джир\p{L}*)|ворклог\p{L}*/iu,
 /(?:выгрузи|экспортир\p{L}*|скачай|сохрани)\s+(?:мо[ёе]\s+)?(?:учёт\s+|учет\s+)?(?:время|времени|активност\p{L}*|часы)\s+(?:в|как)\s+(?:csv|таблиц\p{L}*|excel|эксель)/iu,
 /(?:поставь|ставь)\s+уч[её]т\s+(?:времени|активности)\s+на\s+паузу|(?:приостанови|останови|выключи|отключи|включи|возобнови|продолжи)\s+(?:уч[её]т|трекинг|отслеживание)\s+(?:времени|активности)/iu,
 /(?:удали|сотри|очисти|стереть|удалить)\s+(?:всю\s+)?(?:истори\p{L}*\s+(?:активности|учёта\s+времени|учета\s+времени)|уч[её]т\s+времени|данные\s+уч[её]та\s+времени)/iu
];
// Neighbours: the clock, durations of builds or meetings, focus reports, the journal, money accounting.
const AVOID=/(?:который\s+час|сколько\s+(?:сейчас\s+)?времени\s*\??$|врем\p{L}*\s+(?:в|во)\s+(?:токио|москве|лондоне|нью-йорке|\p{Lu})|с?фокусир\p{L}*|фокус-сесси|помодоро|займ[её]т|(?:сборк|билд|загрузк|ответ\p{L}*\s+сервер|компиляци|рендер)\p{L}*|уч[её]т\p{L}*\s+(?:расход|доход|финанс|товар|склад)|время\s+(?:встречи|созвона|релиза|начала|окончания))/iu;
function wants(text){
 const t=String(text||'');
 if(!TOPIC.some(r=>r.test(t)))return false;
 if(AVOID.test(t)&&!/ворклог|jira|джир|csv|таблиц|excel|эксель|уч[её]т\p{L}*\s+времени|на\s+что\s+(?:у\s+меня\s+)?уш/iu.test(t))return false;
 return true;
}
function intent(text){
 const t=String(text||'');
 if(/(?:удали|сотри|очисти|стереть|удалить)\s+/iu.test(t)&&/истори|уч[её]т|данные/iu.test(t))return {action:'wipe'};
 if(/(?:поставь|ставь)\s+.*на\s+паузу|приостанови|останови/iu.test(t)){const m=/(\d{1,3})\s*мин/iu.exec(t),h=/(\d{1,2})\s*час/iu.exec(t);return {action:'pause',minutes:m?Number(m[1]):h?Number(h[1])*60:/на\s+час(?=$|[^\p{L}])/iu.test(t)?60:0};}
 if(/(?:выключи|отключи)\s+(?:уч[её]т|трекинг|отслеживание)/iu.test(t))return {action:'off'};
 if(/(?:включи|возобнови|продолжи)\s+(?:уч[её]т|трекинг|отслеживание)/iu.test(t))return {action:'on'};
 if(/ворклог|(?:запиши|записать|залогируй|спиши|списать|внеси|занеси)\s+.*(?:jira|джир)/iu.test(t))return {action:'worklog',group:'task'};
 if(/csv|таблиц|excel|эксель/iu.test(t))return {action:'export'};
 if(/по\s+задачам|разрезе\s+задач|на\s+задач/iu.test(t))return {action:'show',group:'task'};
 if(/по\s+проектам|разрезе\s+проектов/iu.test(t))return {action:'show',group:'project'};
 const app=/(?:сидел\p{L}*|просидел\p{L}*|провёл|провел\p{L}*|проторчал\p{L}*|работал\p{L}*|потратил\p{L}*|был\p{L}*|ушло|уходит)\s+(?:сегодня\s+|вчера\s+)?(?:в|во|на|над)\s+(.+?)(?:\s+(?:сегодня|вчера|позавчера|на\s+(?:этой|прошлой)|за\s+|в\s+(?:понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье))|[?!.,]|$)/iu.exec(t);
 if(app&&!/^(?:задач\p{L}*|проект\p{L}*|работ\p{L}*|встреч\p{L}*)$/iu.test(app[1].trim()))return {action:'app',query:app[1].trim().slice(0,40)};
 return {action:'show',group:'app'};
}

// --- Data for the card ------------------------------------------------------------------------------------------------
const dur=ms=>{const m=Math.round(ms/MIN),h=Math.floor(m/60);return h?h+' ч'+(m%60?' '+m%60+' мин':''):m+' мин';};
const ALIASES=[[/^юнит/iu,'unity'],[/^слак|^слэк/iu,'slack'],[/^телег/iu,'telegram'],[/^фигм/iu,'figma'],[/^хром/iu,'chrome'],[/^блендер/iu,'blender'],
[/^дискорд/iu,'discord'],[/^райдер/iu,'rider'],[/^(?:вс\s*код|vs\s*code|вскод|vscode)/iu,'code'],[/^фотошоп/iu,'photoshop'],[/^терминал/iu,'terminal'],
 [/^почт/iu,'mail|outlook|почта|thunderbird|spark'],[/^джир/iu,'jira'],[/^ноушн/iu,'notion'],[/^обсидиан/iu,'obsidian'],[/^петe|^пет[еюя]/iu,'петя'],[/^эксел/iu,'excel']];
// Which spans a named app means: aliases, browsers, then the name's stem against app names (and project names).
function matcher(query){
 const q=String(query||'').toLocaleLowerCase().replace(/[«»"']/g,'').trim();
 const task=/^([a-z][a-z0-9]{1,9}-\d{1,6})$/i.exec(q);
 if(task)return {label:task[1].toUpperCase(),test:s=>s.task===task[1].toUpperCase()};
 if(/^браузер/u.test(q))return {label:'браузер',test:s=>isBrowser(s.app)};
 const alias=ALIASES.find(([re])=>re.test(q));
 const names=alias?alias[1].split('|'):[q.replace(/(?:е|у|а|ом|ах|ой)$/u,''),q];
 const label=alias?alias[1].split('|')[0]:q;
 return {label,test:s=>{const a=String(s.app||'').toLocaleLowerCase(),p=String(s.project||'').toLocaleLowerCase();return names.some(n=>n.length>=2&&(a===n||a.startsWith(n)||a.includes(' '+n)||a.includes(n+' ')||p===n||n.length>=4&&a.includes(n)));}};
}
// Display blocks for the day timeline: neighbouring spans of one category less than 2 minutes apart are drawn as one.
function blocks(spans){
 const out=[];
 for(const s of spans){
  const prev=out.at(-1);
  if(prev&&prev.category===s.category&&s.start-prev.end<2*MIN){prev.end=Math.max(prev.end,s.end);prev.apps.set(s.app,(prev.apps.get(s.app)||0)+s.end-s.start);continue;}
  out.push({start:s.start,end:s.end,category:s.category,apps:new Map([[s.app,s.end-s.start]])});
 }
 return out.slice(-600).map(b=>({start:b.start,end:b.end,category:b.category,label:[...b.apps].sort((x,y)=>y[1]-x[1]).slice(0,2).map(([a])=>a).join(', ')}));
}
// Activity during a calendar meeting counts as meetings, whatever app was in front (the call app, notes, slides):
// spans are cut at the meetings' edges. This is how meeting time is known without naming any meeting app.
function inMeetings(spans,meetings){
 if(!meetings.length)return spans;
 const out=[];
 for(const x of spans){
  let pieces=[{...x}];
  for(const m of meetings){
   const next=[];
   for(const p of pieces){
    if(p.inMeeting||m.end<=p.start||m.start>=p.end){next.push(p);continue;}
    if(p.start<m.start)next.push({...p,end:m.start});
    next.push({...p,start:Math.max(p.start,m.start),end:Math.min(p.end,m.end),category:'meetings',inMeeting:true});
    if(p.end>m.end)next.push({...p,start:m.end});
   }
   pieces=next;
  }
  out.push(...pieces);
 }
 return out.map(({inMeeting,...p})=>p);
}
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

async function build(s,range,{mode='app',query='',worklog=false,exportReady=false,deps={}}={}){
 const mapping=categories.parse(s.settings.timeTrackingCategories);
 const meetings=range.to-range.from<=8*86400000?await overlay.meetings(s,{from:range.from,to:range.to,fetcher:deps.fetcher}).catch(()=>null):null;
 let spans=inMeetings(s.activity.spans({from:range.from,to:range.to}).map(x=>({...x,category:categories.of(x,mapping)})),meetings||[]);
 let app=null;
 if(mode==='app'&&query){const m=matcher(query);spans=spans.filter(m.test);app={query,label:m.label};}
 const total=spans.reduce((n,x)=>n+x.end-x.start,0);
 const cats=categories.IDS.map(id=>({id,ms:spans.filter(x=>x.category===id).reduce((n,x)=>n+x.end-x.start,0)}));
 const key=mode==='task'?x=>x.task||'':mode==='project'?x=>x.project||'':x=>x.app||'—';
 const groups=new Map();
 for(const x of spans){const k=key(x);if(!k)continue;const g=groups.get(k)||{key:k,ms:0,category:x.category,url:'',titles:new Map(),apps:new Map()};g.ms+=x.end-x.start;if(x.url&&!g.url)g.url=x.url;
  if(x.title)g.titles.set(x.title,(g.titles.get(x.title)||0)+x.end-x.start);g.apps.set(x.app,(g.apps.get(x.app)||0)+x.end-x.start);groups.set(k,g);}
 const rows=[...groups.values()].sort((a,b)=>b.ms-a.ms).slice(0,12).map(g=>({key:g.key,ms:g.ms,category:mode==='app'?categories.of({app:g.key,title:[...g.titles.keys()][0]||''},mapping):g.category,url:g.url,
  detail:mode==='app'?(mapping[categories.key(g.key)]?'своя категория':''):[...g.apps].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([a])=>a).join(', '),
  top:mode==='app'&&!isBrowser(g.key)?'':[...g.titles].sort((a,b)=>b[1]-a[1])[0]?.[0]||''}));
 const untagged=mode==='task'||mode==='project'?total-rows.reduce((n,r)=>n+r.ms,0):0;
 const day=range.kind==='day';
 const days=[];
 if(!day){for(let t=range.from;t<range.to;t=period.addDays(t,1)){const a=t,b=period.addDays(t,1);const list=spans.filter(x=>x.start<b&&x.end>a);days.push({day:ymd(a),from:a,by:Object.fromEntries(categories.IDS.map(id=>[id,list.filter(x=>x.category===id).reduce((n,x)=>n+Math.min(b,x.end)-Math.max(a,x.start),0)]))});}}
 const status=s.activity.status();
 return {timeCard:{mode,period:{kind:range.kind,label:range.label,from:range.from,to:range.to},now:Date.now(),total,categories:cats,rows,untagged,app,
  timeline:day?blocks(spans):[],days,meetings:meetings||[],calendar:meetings!==null,focus:overlay.focus(s,range),
  tracking:{enabled:status.enabled,paused:status.paused,pausedUntil:status.pausedUntil,interval:status.interval,since:status.days},
  jira:worklogs.ready(s.settings),worklog:!!worklog,exportReady:!!exportReady,
  labels:categories.LABELS,colors:categories.COLORS}};
}
function summaryText(card,range){
 const c=card.timeCard;
 const when=range.phrase[0].toUpperCase()+range.phrase.slice(1);
 if(!c.total)return c.app?when+' в «'+c.app.query+'» времени не учтено.':when+' активности не учтено'+(c.tracking.enabled?'':' — учёт выключен')+'.';
 if(c.app){
  const best=c.days.filter(d=>Object.values(d.by).some(Boolean)).map(d=>({d,ms:Object.values(d.by).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.ms-a.ms)[0];
  return when+' в «'+c.app.query+'» — '+dur(c.total)+(best&&c.days.length>1?' (больше всего '+new Date(best.d.from).toLocaleDateString('ru-RU',{weekday:'long'})+', '+dur(best.ms)+')':'')+'.';
 }
 const parts=c.categories.filter(x=>x.ms>=MIN).sort((a,b)=>b.ms-a.ms).map(x=>categories.LABELS[x.id].toLowerCase()+' '+dur(x.ms));
 const top=c.rows[0];
 const by=c.mode==='task'?(c.rows.length?' По задачам: '+c.rows.slice(0,4).map(r=>r.key+' — '+dur(r.ms)).join(', ')+'.':' Задач Jira в заголовках окон не нашлось.'):c.mode==='project'?(c.rows.length?' По проектам: '+c.rows.slice(0,4).map(r=>r.key+' — '+dur(r.ms)).join(', ')+'.':' Проектов в заголовках окон не нашлось.'):top?' Больше всего — '+top.key+' ('+dur(top.ms)+').':'';
 return when+' учтено '+dur(c.total)+': '+parts.join(', ')+'.'+by;
}

// --- Chat turn ----------------------------------------------------------------------------------------------------------
const CONSENT='Учёт времени выключен. Если включить, Петя будет каждые 15 секунд запоминать, какое приложение и окно на переднем плане (без содержимого окон, без нажатий клавиш), и хранить это только на этом компьютере 30 дней. Заголовки окон менеджеров паролей, банков и приватных вкладок не сохраняются. Включить?';
async function answer(s,command,want,deps){
 const now=deps.now?.()??Date.now();
 const range=period.parse(command,now);
 const mode=want.action==='app'?'app':want.group||'app';
 const card=await build(s,range,{mode,query:want.query,worklog:want.action==='worklog',exportReady:want.action==='export',deps});
 let text=summaryText(card,range);
 if(want.action==='worklog')text=card.timeCard.jira?(card.timeCard.rows.length?text+' Проверьте строки в карточке и нажмите «Записать в Jira» — без подтверждения ничего не записывается.':text):'Чтобы записывать время в задачи, подключите Jira в настройках. '+text;
 if(want.action==='export')text+=' Нажмите «Скачать CSV» в карточке.';
 if(card.timeCard.tracking.paused)text+=' Учёт сейчас на паузе.';
 return kit.reply(s,command,{by:BY,text,data:card});
}
async function turn(s,command,deps={}){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!wants(text))return null;
 if(!s.activity)return kit.reply(s,command,{by:BY,error:true,text:'Учёт активности ещё загружается. Повторите через минуту.'});
 const want=intent(text);
 if(!s.activity.supported)return kit.reply(s,command,{by:BY,error:true,text:'На этом компьютере Петя не может узнать активное окно, поэтому учёт времени недоступен.'});
 const status=s.activity.status();
 if(want.action==='wipe')return ask({text:'Удалить всю историю активности ('+status.days+' '+kit.plural(status.days,['день','дня','дней'])+')? Это нельзя отменить.',label:BY,options:['Удалить историю','Отмена'],strictChoices:true},a=>{
  if(!/удалить/iu.test(String(a)))return kit.reply(s,command,{by:BY,text:'Хорошо, история активности осталась.'});
  s.activity.wipe();return kit.reply(s,command,{by:BY,text:'История активности удалена.'+(status.enabled?' Учёт продолжается с этого момента.':'')});
 });
 if(want.action==='off'){s.activity.enable(false);return kit.reply(s,command,{by:BY,text:'Учёт времени выключен. Собранная история осталась на компьютере; удалить её можно в настройках «Учёта времени» или словами «удали историю активности».'});}
 if(want.action==='pause'){if(!status.enabled)return kit.reply(s,command,{by:BY,text:'Учёт времени и так выключен.'});s.activity.pause(want.minutes||0);return kit.reply(s,command,{by:BY,text:want.minutes?'Учёт на паузе на '+dur(want.minutes*MIN)+'.':'Учёт на паузе. Скажите «возобнови учёт времени», чтобы продолжить.'});}
 if(want.action==='on'){
  if(status.enabled&&status.paused){s.activity.resume();return kit.reply(s,command,{by:BY,text:'Учёт времени продолжается.'});}
  if(status.enabled)return kit.reply(s,command,{by:BY,text:'Учёт времени уже включён.'});
 }
 if(!status.enabled)return ask({text:CONSENT,label:BY,options:['Включить учёт','Не сейчас'],strictChoices:true},a=>{
  if(!/включить/iu.test(String(a)))return kit.reply(s,command,{by:BY,text:'Хорошо, учёт остаётся выключенным. Включить его можно в настройках «Учёта времени».'});
  s.activity.enable(true);
  if(want.action==='on')return kit.reply(s,command,{by:BY,text:'Учёт времени включён. Первые данные появятся через несколько минут.'});
  return answer(s,command,want,deps);
 });
 if(want.action==='on')return kit.reply(s,command,{by:BY,text:'Учёт времени уже включён.'});
 return answer(s,command,want,deps);
}

// --- Renderer calls --------------------------------------------------------------------------------------------------
const stamp=t=>{const d=new Date(t);return ymd(t)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');};
function csv(rows){
 const q=v=>{const t=String(v??'');return /[",\n;]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
 return '\uFEFF'+['start,end,minutes,app,title,project,task,category',...rows.map(r=>[stamp(r.start),stamp(r.end),((r.end-r.start)/MIN).toFixed(1),r.app,r.title,r.project||'',r.task||'',r.category].map(q).join(','))].join('\r\n')+'\r\n';
}
// The same rows as the CSV, as the table «Выгрузить в Google Таблицы» hands to `spreadsheet-export`: minutes are
// numbers, categories are their names; the title names the period's dates.
function table(rows,{from,to}){
 return {title:'Учёт времени · '+ymd(from)+(to-from>86400000?' – '+ymd(to-1):''),sheet:'Учёт времени',app:'Учёт времени',
  header:['Начало','Конец','Минуты','Приложение','Окно','Проект','Задача','Категория'],
  rows:rows.map(r=>[stamp(r.start),stamp(r.end),Math.round((r.end-r.start)/MIN*10)/10,r.app,r.title,r.project||'',r.task||'',categories.LABELS[r.category]||r.category])};
}
function setup(s,{dialog}={}){
 const log=worklogs.create(s);
 const range=(from,to)=>{const a=Number(from),b=Number(to);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>370*86400000)throw Error('Некорректный период.');return {from:a,to:b};};
 // Spans of a period with their categories, for both exports.
 const spans=(from,to)=>{
  if(!s.activity)throw Error('Учёт активности ещё загружается.');
  const r=range(from,to),mapping=categories.parse(s.settings.timeTrackingCategories);
  const rows=s.activity.spans(r).map(x=>({...x,category:categories.of(x,mapping)}));
  if(!rows.length)throw Error('За этот период нечего выгружать.');
  return {r,rows};
 };
 return {ipc:{
  async exportCsv(from,to,label){
   const {r,rows}=spans(from,to);
   const d=dialog||require('electron').dialog;
   const name='time-'+ymd(r.from)+(r.to-r.from>86400000?'_'+ymd(r.to-1):'')+'.csv';
   const result=await d.showSaveDialog(s.win&&!s.win.isDestroyed?.()?s.win:undefined,{title:'Сохранить учёт времени',defaultPath:name,filters:[{name:'CSV',extensions:['csv']}]});
   if(result.canceled||!result.filePath)return {canceled:true};
   fs.writeFileSync(result.filePath,csv(rows));
   return {path:result.filePath,rows:rows.length};
  },
  // The table for «Выгрузить в Google Таблицы»: read when the button is pressed, written only after the export card
  // of the providing app confirms.
  exportTable(from,to){const {r,rows}=spans(from,to);return table(rows,r);},
  // The user's category for an app (from the card's chip menu); 'auto' removes it.
  setCategory(app,category){
   const k=categories.key(app);if(!k)throw Error('Нет приложения.');
   const m=categories.parse(s.settings.timeTrackingCategories);
   if(category==='auto')delete m[k];else if(categories.IDS.includes(category))m[k]=category;else throw Error('Нет такой категории.');
   s.saveSettings({timeTrackingCategories:JSON.stringify(m)});return {ok:true};
  },
  worklogPreview:(from,to)=>log.preview(range(from,to)),
  worklogWrite:(id,rows)=>log.write(id,rows)
 }};
}
function validate(next){categories.validate(next);}
module.exports={name:'timeTracking',defaults:{['extension_'+ID]:'false',timeTrackingCategories:'{}'},validate,setup,turn,wants,intent,build,summaryText,csv,table,matcher};
