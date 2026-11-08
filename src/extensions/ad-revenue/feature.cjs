// «Реклама и монетизация»: ad revenue of the user's games in the chat — revenue by day, network, format and
// country, eCPM trends, fill rate and ARPDAU where a source reports them, and anomalies against a 4-week baseline.
// Source-agnostic: the numbers come from `ad-source` providers (sources.cjs; first ones: AppLovin MAX and Unity
// LevelPlay in this directory). Everything shown is computed from the services' reports; no model is involved.
// Nothing here writes anywhere: «Отправить в …» on the card hands a prepared text to the messaging app's own flow.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const analysis=require('./analysis.cjs');
const registry=require('./sources.cjs');
const applovin=require('./applovin-source.cjs');
const levelplay=require('./levelplay-source.cjs');
const ID='ad-revenue',BY='Реклама и монетизация';

function validate(next){
 for(const [key,re,name] of [['adRevenueApplovinKey',applovin.KEY,'Report Key AppLovin'],['adRevenueLevelplaySecret',levelplay.SECRET,'Secret Key LevelPlay'],['adRevenueLevelplayRefresh',levelplay.SECRET,'Refresh Token LevelPlay']]){
  if(next[key]===undefined)continue;
  const v=String(next[key]||'').trim();
  if(v&&!re.test(v))throw Error(name+' указан неверно: только латиница, цифры, «-» и «_», без пробелов.');
  next[key]=v;
 }
}

const usd=v=>Number(v||0).toLocaleString('ru-RU',{style:'currency',currency:'USD',maximumFractionDigits:v>=100?0:v>0&&v<1?3:2});
const pct=v=>Math.round(Math.abs(v)*100)+'%';
const big=n=>n>=1e6?(n/1e6).toLocaleString('ru-RU',{maximumFractionDigits:1})+' млн':n>=1e4?Math.round(n/1e3).toLocaleString('ru-RU')+' тыс.':Number(n||0).toLocaleString('ru-RU');
// «к обычному вторнику»: the weekday in the dative.
const WEEKDAY=['воскресенью','понедельнику','вторнику','среде','четвергу','пятнице','субботе'];
const weekday=day=>WEEKDAY[new Date(day+'T12:00:00Z').getUTCDay()];
const region=code=>{try{return new Intl.DisplayNames(['ru'],{type:'region'}).of(code)||code;}catch{return code;}};
const cap=s=>s[0].toUpperCase()+s.slice(1);
const vs=(c,what)=>c==null?'':' ('+(c>=0?'+':'−')+pct(c)+' '+what+')';

function summary(a,ask,card){
 const t=a.totals,label=ask.period.label;
 const scope=[ask.format,ask.network,ask.platform==='ios'?'iOS':ask.platform==='android'?'Android':'',...a.apps].filter(Boolean).join(', ');
 if(a.empty)return 'Данных о рекламной выручке '+label+(scope?' ('+scope+')':'')+' нет'+(ask.period.kind==='today'?': отчёты за сегодня появляются с задержкой.':'.');
 const relative=t.weekday?vs(t.weekday.change,(/е$/.test(weekday(ask.period.start))?'к обычной ':'к обычному ')+weekday(ask.period.start)):vs(t.change,'к прошлому периоду');
 const head=cap(label)+(scope?' ('+scope+')':'')+' реклама принесла '+usd(t.revenue)+relative+', '+big(t.impressions)+' '+kit.plural(t.impressions,['показ','показа','показов'])+(t.ecpm!=null?', eCPM '+usd(t.ecpm):'')+'.';
 const v=ask.view;
 if(v==='format'&&a.formats.length){const [f,g]=a.formats;return head+' Больше всего приносит '+f.format+' — '+usd(f.revenue)+' ('+pct(f.share)+')'+(g?', дальше '+g.format+' — '+usd(g.revenue)+' ('+pct(g.share)+')':'')+'.';}
 if(v==='ecpm'&&a.networks.length)return head+' eCPM по сетям: '+a.networks.filter(n=>n.ecpm!=null).slice(0,5).map(n=>n.name+' '+usd(n.ecpm)).join(', ')+'.';
 if(v==='fill'){const rows=a.networks.filter(n=>n.fill!=null);return head+(t.fill!=null?' Fill rate: '+pct(t.fill)+'.':rows.length?' Fill rate по сетям: '+rows.slice(0,5).map(n=>n.name+' '+pct(n.fill)).join(', ')+'.':' Fill rate подключённые источники не сообщают.');}
 if(v==='arpdau')return head+(t.arpdau!=null?' ARPDAU: '+usd(t.arpdau)+' при '+big(t.dau)+' DAU в среднем.':' ARPDAU посчитать не из чего: нужен DAU — его сообщает LevelPlay (activeUsers).');
 if(v==='country'&&a.countries.length)return head+' Больше всего — '+a.countries.slice(0,3).map(c=>region(c.country)+' '+usd(c.revenue)).join(', ')+'.';
 if(v==='anomaly'||card.anomalyFocus){
  const x=a.anomalies.find(x=>x.change<0&&(!ask.format||x.label===ask.format)&&(!ask.network||x.label===ask.network))||a.anomalies.find(x=>x.change<0);
  if(x)return head+' '+cap(x.dimension==='total'?'выручка':'выручка '+(x.dimension==='format'?'с ':'от ')+x.label)+' '+new Date(x.day+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+' — '+usd(x.revenue)+', на '+pct(x.change)+' ниже обычного для этого дня недели ('+usd(x.baseline)+').';
  return head+(a.baselineDays>=14?' Заметных просадок относительно последних 4 недель нет.':' Для сравнения с 4-недельной нормой не хватает истории.');
 }
 if(v==='network'||!v){const n=a.networks[0];return head+(n?' Больше всего — '+n.name+': '+usd(n.revenue)+' ('+pct(n.share)+').':'');}
 return head;
}

async function adTurn(s,command,now=new Date()){
 const ready=registry.create(s).ready();
 const ask=query.parse(command,now);
 const p=ask.period;
 // The window: the period plus 4 weeks before it (baseline and previous period), within what every source serves.
 const limit=Math.min(...ready.map(x=>x.source.maxDays||45));
 const earliest=query.localDay(now,-(limit-1));
 let start=analysis.shift(p.start,-Math.max(28,p.days));if(start<earliest)start=earliest;
 if(p.start<earliest)return kit.reply(s,command,{by:BY,question:true,text:'Отчёты доступны только за последние '+limit+' '+kit.plural(limit,['день','дня','дней'])+'. Спросите за более короткий период.'});
 const data={rows:[],days:[],countries:[]};const notes=[],failed=[],used=[];
 for(const x of ready){
  s.requestProgress?.report('Читаю отчёт '+x.name);
  try{const r=await x.source.fetch(s,{start,end:p.end,current:{start:p.start,end:p.end},check:()=>{}});
   data.rows.push(...(r.rows||[]).map(row=>({...row,source:x.id})));data.days.push(...(r.days||[]));data.countries.push(...(r.countries||[]));notes.push(...(r.notes||[]));used.push(x.name);}
  catch(e){failed.push({name:x.name,error:e});}
 }
 if(!used.length){const e=failed[0].error;return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(failed.length>1?failed.map(f=>f.name+': '+f.error.message).join(' '):e.message)});}
 for(const f of failed)notes.unshift(f.name+': '+f.error.message);
 if(p.partial)notes.push('За сегодня данные неполные: отчёты обновляются с задержкой.');
 const a=analysis.analyse(data,ask,{text:command,now});
 if(ask.view==='arpdau'&&a.totals.arpdau==null)notes.push('ARPDAU появится, когда источник сообщает DAU: LevelPlay (activeUsers). Приложение с метриками DAU можно будет подключить позже.');
 const card={sources:used,period:{label:p.label,kind:p.kind,from:p.start,to:p.end,days:p.days,partial:!!p.partial},filters:{format:ask.format,network:ask.network,platform:ask.platform,country:ask.country,apps:a.apps},
  view:ask.view,compare:ask.compare,currency:'USD',totals:a.totals,chart:a.chart,networks:a.networks.slice(0,12),formats:a.formats,matrix:a.matrix,countries:a.countries,countriesNarrowed:a.countriesNarrowed,
  anomalies:a.anomalies,baselineDays:a.baselineDays,notes:[...new Set(notes)].slice(0,6),empty:a.empty};
 card.anomalyFocus=ask.view==='anomaly';
 const text=summary(a,ask,card)+(failed.length?' Не удалось прочитать: '+failed.map(f=>f.name).join(', ')+'.':'');
 return kit.reply(s,command,{by:BY,text,data:{adRevenue:card}});
}

function connectText(){return 'Рекламная выручка ещё не подключена. Откройте Настройки → «Реклама и монетизация»: вставьте Report Key AppLovin MAX или Secret Key и Refresh Token Unity LevelPlay — потом повторите вопрос.';}

function setup(s){
 return {ipc:{
  status:()=>({sources:registry.create(s).all().map(x=>({...x,ready:!!registry.create(s).find(x.id)})),hasApplovin:!!s.settings.adRevenueApplovinKey,hasLevelplay:!!(s.settings.adRevenueLevelplaySecret&&s.settings.adRevenueLevelplayRefresh)}),
  // «Проверить подключение» in settings: one day of each ready source, nothing stored.
  async check(){
   const out=[];const day=query.localDay(new Date(),-1);
   for(const x of registry.create(s).ready()){try{const r=await x.source.fetch(s,{start:day,end:day,current:{start:day,end:day},check:()=>{}});out.push({id:x.id,name:x.name,ok:true,rows:(r.rows||[]).length});}catch(e){out.push({id:x.id,name:x.name,ok:false,error:e.message});}}
   if(!out.length)throw Error('Сначала сохраните ключ AppLovin MAX или LevelPlay.');
   return out;
  }
 }};
}

async function turn(s,command){
 const text=String(command||'');
 if(!query.about(text)||!kit.installed(s,ID))return null;
 if(!registry.create(s).ready().length)return kit.reply(s,command,{by:BY,question:true,text:connectText()});
 try{return await adTurn(s,text);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'Отчёт недоступен.')});}
}
module.exports={name:'adRevenue',defaults:{['extension_'+ID]:'false',adRevenueApplovinKey:'',adRevenueLevelplaySecret:'',adRevenueLevelplayRefresh:''},
 secrets:['adRevenueApplovinKey','adRevenueLevelplaySecret','adRevenueLevelplayRefresh'],validate,setup,turn,adTurn,summary};
