// «Grafana»: dashboards of a (self-hosted or cloud) Grafana in the chat, read-only. «какие дашборды есть» lists
// them, «найди дашборд про ретеншн» searches (Russian words against English titles too), «что на дашборде лиг»,
// «покажи лиги за неделю» or a pasted dashboard / panel link opens one: up to 8 panels drawn natively from the panel
// queries' data frames (timeseries lines, stat / gauge tiles with threshold colors, bar gauges, tables), with the
// link's time range, variables and viewPanel respected. Panels mapped to game metrics in settings feed «Метрики
// игры» through metrics-source.cjs. Every number comes from Grafana; the local model is used only to propose the
// metric mapping (the user confirms it).
const kit=require('../app-kit.cjs');
const client=require('./client.cjs');
const query=require('./query.cjs');
const find=require('./find.cjs');
const load=require('./load.cjs');
const links=require('./links.cjs');
const mapping=require('./mapping.cjs');
const ID='grafana',BY='Grafana';
const WHERE='Откройте Настройки → «Grafana»: адрес Grafana и токен сервисного аккаунта с ролью Viewer — потом повторите вопрос.';

function validate(next){
 if(next.grafanaUrl!==undefined)next.grafanaUrl=client.base(next.grafanaUrl);
 const folder=String(next.grafanaFolder||'').trim();
 if(folder.length>120)throw Error('Папка Grafana по умолчанию — название или UID до 120 символов.');
 next.grafanaFolder=folder;
 if(next.grafanaRender!==undefined&&!['true','false'].includes(next.grafanaRender))throw Error('Картинки панелей: да или нет.');
 if(next.grafanaCurrency&&!['RUB','USD','EUR'].includes(next.grafanaCurrency))throw Error('Валюта выручки: RUB, USD или EUR.');
 if(next.grafanaMetricMap!==undefined){const v=JSON.stringify(mapping.parse(next.grafanaMetricMap||'{}'));if(v.length>1900)throw Error('Сопоставление панелей Grafana слишком длинное.');next.grafanaMetricMap=v;}
}

// The dashboard list, kept for 5 minutes per Grafana address (one GET /api/search for every lookup in between).
const lists=new Map();
async function dashboards(s,{fresh=false}={}){
 const c=client.config(s),k=c.url+'\n'+c.token.slice(-6);
 const hit=lists.get(k);
 if(!fresh&&hit&&Date.now()-hit.at<5*60000)return hit.list;
 const list=await client.search(s,{});
 lists.set(k,{at:Date.now(),list});
 return list;
}

const fmt=(v,unit,decimals)=>{
 if(v===null||v===undefined||!Number.isFinite(v))return '—';
 const d=Number.isInteger(decimals)?decimals:Math.abs(v)>=100?0:Math.abs(v)>=1?1:2;
 const n=(x,dd=d)=>x.toLocaleString('ru-RU',{maximumFractionDigits:dd,minimumFractionDigits:Number.isInteger(decimals)?dd:0});
 if(unit==='percent')return n(v)+'%';
 if(unit==='percentunit')return n(v*100)+'%';
 const cur={currencyUSD:'$',currencyEUR:'€',currencyRUB:'₽',currencyGBP:'£'}[unit];
 return cur?n(v)+' '+cur:n(v);
};
function summary(card){
 const head='Дашборд «'+card.title+'»'+(card.folder?' (папка '+card.folder+')':'')+', '+card.range.label;
 const vars=card.vars.filter(v=>v.from!=='dashboard').map(v=>v.label+' = '+v.text.join(', '));
 const facts=[];
 for(const p of card.panels){
  if(p.kind==='stat'&&p.items?.length)facts.push((p.items.length===1?p.title||p.items[0].name:p.title+': '+p.items[0].name)+' — '+(p.items[0].text??fmt(p.items[0].value,p.items[0].unit,p.items[0].decimals)));
  if(facts.length>=3)break;
 }
 const failed=card.panels.filter(p=>p.error).length;
 const count=card.viewPanel!==null?'панель «'+(card.panels[0]?.title||card.viewPanel)+'»':card.panels.length+' '+kit.plural(card.panels.length,['панель','панели','панелей'])+(card.total>card.panels.length?' из '+card.total:'');
 return head+(vars.length?' ('+vars.join('; ')+')':'')+': '+count+'.'+(facts.length?' '+facts.join('; ')+'.':'')+(failed?' Не загрузились: '+failed+'.':'');
}

// Grafana's search returns `url` with its own sub-path («/grafana/d/uid/slug») when served from one.
function absolute(base,url){
 if(!/^\/[^/]/.test(url||''))return '';
 try{const b=new URL(base),prefix=b.pathname.replace(/\/+$/,'');return b.origin+(prefix&&url.startsWith(prefix+'/')?url:prefix+url);}catch{return '';}
}
function listCard(c,items,{query:q='',total,notFound=false}={}){
 return {kind:'list',base:c.url,query:q,total:total??items.length,folder:c.folder,notFound,
  items:items.slice(0,12).map(d=>({uid:d.uid,title:d.title,folder:d.folder,tags:d.tags,url:absolute(c.url,d.url)||links.dashboard(c.url,{uid:d.uid})}))};
}

async function show(s,command,{uid,link,ask}){
 s.requestProgress?.report('Читаю дашборд Grafana');
 const card=await load.open(s,{uid,link,ask});
 s.requestProgress?.report('Рисую панели');
 return kit.reply(s,command,{by:BY,text:summary(card),data:{grafanaCard:card},sources:[{title:'Grafana · '+card.title,url:card.dashboardUrl}]});
}

async function grafanaTurn(s,command,ask){
 const c=client.config(s);
 if(ask.write)return kit.reply(s,command,{by:BY,text:'Я только читаю Grafana: дашборды, панели и их данные. Создать или изменить дашборд можно в самой Grafana.'});
 if(ask.shortLink&&!ask.link)return kit.reply(s,command,{by:BY,question:true,text:'Короткую ссылку Grafana (/goto/…) я не раскрываю. Откройте её и пришлите полную ссылку на дашборд (с /d/…).'});
 // A pasted link: its dashboard, panel, time and variables.
 if(ask.link){
  if(!links.sameServer(ask.link,c.url))return kit.reply(s,command,{by:BY,question:true,text:'Ссылка ведёт на другую Grafana ('+new URL(ask.link.base).host+'), а подключена '+new URL(c.url).host+'. Подключите её адрес в Настройки → «Grafana» или пришлите ссылку с подключённой.'});
  return show(s,command,{uid:ask.link.uid,link:ask.link,ask:{text:command,range:ask.range}});
 }
 // A mapped game metric named with Grafana: the dashboard of its panel, that panel.
 const map=mapping.read(s.settings);
 if(ask.metric&&map[ask.metric]&&(ask.named||ask.dash)&&ask.words.length<=2){
  const m=map[ask.metric];
  return show(s,command,{uid:m.d,ask:{text:command,range:ask.range||{from:'now-30d',to:'now',label:'за месяц'},panelId:m.p}});
 }
 s.requestProgress?.report('Ищу дашборды Grafana');
 const list=await dashboards(s);
 if(ask.intent==='list'||!ask.words.length&&ask.intent!=='show'){
  const f=find.norm(c.folder);
  const sorted=[...list].sort((a,b)=>(f&&(find.norm(b.folder)===f||b.folderUid===c.folder))-(f&&(find.norm(a.folder)===f||a.folderUid===c.folder))||a.folder.localeCompare(b.folder)||a.title.localeCompare(b.title));
  const card=listCard(c,sorted,{total:list.length});
  const text=list.length?'В Grafana '+list.length+' '+kit.plural(list.length,['дашборд','дашборда','дашбордов'])+': '+sorted.slice(0,6).map(d=>'«'+d.title+'»').join(', ')+(list.length>6?' и другие':'')+'.':'Сервисный аккаунт Grafana не видит ни одного дашборда. Дайте ему доступ (роль Viewer) к нужным папкам.';
  return kit.reply(s,command,{by:BY,text,data:list.length?{grafanaCard:card}:undefined});
 }
 if(!ask.words.length)return kit.reply(s,command,{by:BY,question:true,text:'Какой дашборд открыть? Назовите его или пришлите ссылку из Grafana.'});
 const ranked=find.rank(list,ask.words,{folder:c.folder,strict:false});
 const choice=find.pick(ranked);
 const words=ask.words.join(' ');
 if(choice.none){
  const card=listCard(c,list,{query:words,total:list.length,notFound:true});
  return kit.reply(s,command,{by:BY,question:true,text:'В Grafana нет дашборда про «'+words+'».'+(list.length?' Есть: '+list.slice(0,6).map(d=>'«'+d.title+'»').join(', ')+'.':''),data:list.length?{grafanaCard:card}:undefined});
 }
 if(ask.intent==='search'||choice.several){
  const items=choice.one?ranked.slice(0,8):choice.several;
  const card=listCard(c,items,{query:words,total:items.length});
  if(ask.intent==='search'&&choice.one&&ranked.length===1)return show(s,command,{uid:choice.one.uid,ask:{text:command,range:ask.range}});
  const text=(choice.several?'Подходят несколько дашбордов: ':'Нашёл: ')+items.slice(0,6).map(d=>'«'+d.title+'»'+(d.folder?' ('+d.folder+')':'')).join(', ')+'.'+(choice.several&&ask.intent!=='search'?' Какой открыть?':'');
  return kit.reply(s,command,{by:BY,text,question:!!choice.several&&ask.intent!=='search',data:{grafanaCard:card}});
 }
 return show(s,command,{uid:choice.one.uid,ask:{text:command,range:ask.range}});
}

function setup(s){
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Расширение «Grafana» не добавлено.');if(!client.connected(s.settings))throw Error('Grafana не подключена. '+WHERE);};
 return {ipc:{
  status:()=>{const c=client.config(s);return {url:c.url,hasToken:!!c.token,folder:c.folder,render:c.render,currency:s.settings.grafanaCurrency||'USD',map:mapping.read(s.settings),metrics:mapping.METRICS};},
  test:async()=>{ready();const r=await client.test(s);lists.clear();const n=(await dashboards(s,{fresh:true})).length;return {...r,dashboards:n};},
  folders:async()=>{ready();const r=await client.api(s,'/api/search',{query:{type:'dash-folder',limit:500}});return (Array.isArray(r)?r:[]).map(f=>({uid:String(f.uid||''),title:String(f.title||'')})).filter(f=>f.uid);},
  propose:async()=>{ready();return mapping.propose(s);},
  // Only from the card's «Картинка панели» button, only when the renderer option is on.
  render:async args=>{ready();const a=args&&typeof args==='object'?args:{};if(!/^[\w-]{1,64}$/.test(String(a.uid||''))||!Number.isInteger(Number(a.panelId)))throw Error('Неверная панель Grafana.');
   return {src:await client.render(s,{uid:a.uid,slug:String(a.slug||'').slice(0,120),panelId:Number(a.panelId),from:String(a.from||'now-6h').slice(0,40),to:String(a.to||'now').slice(0,40),vars:a.vars&&typeof a.vars==='object'?a.vars:{},orgId:a.orgId})};}
 }};
}

async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||query.excluded(text))return null;
 const ask=query.parse(text);
 if(!ask.explicit){
  // «покажи лиги за неделю»: only when Grafana is connected and a dashboard is called so.
  const bare=query.implicit(text);
  if(!bare||!client.connected(s.settings))return null;
  let list;try{list=await dashboards(s);}catch{return null;}
  const ranked=find.rank(list,bare.words,{folder:client.config(s).folder});
  const choice=find.pick(ranked);
  if(!choice.one||choice.one.score<3)return null;
  try{return await show(s,text,{uid:choice.one.uid,ask:{text,range:bare.range}});}
  catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message});}
 }
 if(!client.connected(s.settings))return kit.reply(s,command,{by:BY,question:true,text:'Grafana ещё не подключена. '+WHERE});
 try{return await grafanaTurn(s,text,ask);}
 catch(e){return kit.reply(s,command,{by:BY,error:!e.question,question:!!e.question,text:(e.question?'':BY+' · ')+(e.message||'Grafana недоступна.')});}
}
module.exports={name:'grafana',defaults:{['extension_'+ID]:'false',grafanaUrl:'',grafanaToken:'',grafanaFolder:'',grafanaRender:'false',grafanaCurrency:'USD',grafanaMetricMap:'{}'},
 secrets:['grafanaToken'],validate,setup,turn,grafanaTurn,summary,reset:()=>lists.clear()};
