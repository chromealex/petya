// «Идеи для ивентов»: ideas built by code from evidence — upcoming holidays of the regions, competitors' recent events,
// our own past events with their metrics — and costed in the game's currency from its configs (the economy read by
// «Симуляция баланса»' economy.cjs). A mechanic per theme; the cost per participating player follows a formula over
// config values (win reward, daily bonus, item prices) and is shown with each term and its file:line; the constraint
// compares it with an average player's daily income («сколько дней дохода раздаём»).
const H=require('./holidays.cjs');
const MECHANICS={
 login:{name:'Календарь входа',pitch:'подарок за каждый день входа, большой приз в последний день'},
 collect:{name:'Сбор предметов',pitch:'тематические предметы выпадают в боях, за сборы — награды по ступеням'},
 double:{name:'Двойные награды',pitch:'двойная награда за бои на время ивента'},
 sale:{name:'Распродажа',pitch:'скидка на самые дорогие покупки за игровую валюту'},
 tournament:{name:'Турнир',pitch:'таблица лидеров по победам, призы лучшим и награда за участие'},
 pass:{name:'Мини-пропуск',pitch:'ступени наград за очки ивента'},
 pair:{name:'Парные задания',pitch:'задания на двоих — с другом или в клане'}
};
const BY_THEME={gifts:'login',spooky:'collect',love:'pair',sale:'sale',lunar:'login',family:'collect',harvest:'collect',patriotic:'tournament',festival:'pass',spring:'collect'};
// Words of competitors' release notes → a mechanic; holiday words → which holiday they echo.
const MECH_WORDS=[['tournament',/турнир|tournament|leaderboard|лидер|ladder|рейтингов\p{L}*\s+бо/iu],['pass',/(?:battle|season|event)\s*pass|пропуск|сезон\p{L}*\s+наград/iu],['login',/login|вход\p{L}*|календар\p{L}*\s+наград|daily\s+gift|advent/iu],
 ['sale',/sale|discount|скидк|распродаж|offer|предложени/iu],['double',/double|x2|двойн|удвоен/iu],['pair',/co-?op|кооп|вдво[её]м|with\s+friends|с\s+друз/iu],['collect',/collect|собер|сбор|tokens?|жетон|candy|конфет|eggs?|яйц/iu]];
const EVENT_WORDS=/(?:^|[^\p{L}])(?:event|events|ивент\p{L}*|событи\p{L}*|festival|фестивал\p{L}*|limited[- ]time|ограниченн\p{L}*|season\p{L}*|сезон\p{L}*|celebrat\p{L}*|праздн\p{L}*|halloween|хэллоуин\p{L}*|christmas|рождеств\p{L}*|winter|зимн\p{L}*|new\s+year|нов\p{L}*\s+год\p{L}*|valentine|валентин\p{L}*|easter|пасх\p{L}*|lunar|лунн\p{L}*|ramadan|рамадан\p{L}*|diwali|дивали|black\s+friday|thanksgiving|summer|летн\p{L}*|tournament|турнир\p{L}*)(?=$|[^\p{L}])/iu;
const HOLIDAY_WORDS={halloween:/halloween|хэллоуин|spooky|pumpkin|тыкв/iu,christmas:/christmas|рождеств|xmas|santa|санта/iu,'new-year':/new\s+year|нов\p{L}*\s+год|winter|зимн|snow|снеж/iu,valentine:/valentine|валентин|love|любов/iu,easter:/easter|пасх|eggs?\b|яйц/iu,
 'lunar-new-year':/lunar|лунн|chinese\s+new\s+year|китайск\p{L}*\s+нов/iu,'black-friday':/black\s+friday|чёрн\p{L}*\s+пятниц|черн\p{L}*\s+пятниц/iu,ramadan:/ramadan|рамадан/iu,diwali:/diwali|дивали/iu,thanksgiving:/thanksgiving|благодарени/iu};
const mechanicOf=text=>{for(const [m,re] of MECH_WORDS)if(re.test(text))return m;return null;};
const holidayOf=text=>Object.keys(HOLIDAY_WORDS).find(k=>HOLIDAY_WORDS[k].test(text))||null;

// Reference values from the economy (null when the configs have none).
function refs(economy,{actionsPerDay=10,winRate=0.5}={}){
 if(!economy||!economy.main)return null;
 const main=economy.main;
 const src=t=>economy.sources.filter(x=>x.trigger===t&&x.resource===main);
 const win=src('win')[0]||src('action')[0]||null,daily=src('daily')[0]||null,loss=src('loss')[0]||null;
 const battles=x=>x?x.amount*(x.trigger==='win'?actionsPerDay*winRate:x.trigger==='loss'?actionsPerDay*(1-winRate):actionsPerDay):0;
 const income=battles(win)+battles(loss)+(daily?daily.amount:0);
 const sinks=economy.sinks.filter(x=>x.resource===main).sort((a,b)=>a.price-b.price);
 return {main,win,daily,loss,actionsPerDay,winRate,income,battleIncome:battles(win)+battles(loss),sinks,
  median:sinks.length?sinks[Math.floor(sinks.length/2)]:null,top:sinks.slice(-3),max:sinks[sinks.length-1]||null};
}
const at=x=>x?{file:x.file,line:x.line,field:x.field||x.label}:null;
const round=v=>Math.round(v);
// The cost per participating player: [{label, value, from}] terms and their sum.
function cost(mechanic,days,r){
 if(!r||!r.income)return null;
 const terms=[];
 const winAmt=r.win?r.win.amount:0,dailyAmt=r.daily?r.daily.amount:round(r.income*0.3);
 if(mechanic==='login'){terms.push({label:days+' × ежедневный подарок',value:days*dailyAmt,from:at(r.daily)});if(r.median)terms.push({label:'главный приз: «'+r.median.label+'»',value:r.median.price,from:at(r.median)});}
 else if(mechanic==='collect'){if(winAmt)terms.push({label:'3 ступени: 5 + 10 + 15 наград за победу',value:30*winAmt,from:at(r.win)});else terms.push({label:'3 ступени по дневному доходу',value:round(3*r.income),from:null});}
 else if(mechanic==='double'){terms.push({label:'+100% к наградам за бои × '+days+' дн.',value:round(r.battleIncome*days),from:at(r.win)});}
 else if(mechanic==='sale'){if(r.top.length)terms.push({label:'скидка 30% на '+r.top.length+' самые дорогие покупки',value:round(0.3*r.top.reduce((n,x)=>n+x.price,0)),from:at(r.top[r.top.length-1])});}
 else if(mechanic==='tournament'){if(r.max)terms.push({label:'приз лучшим 10%: «'+r.max.label+'» (в среднем на участника)',value:round(0.1*r.max.price),from:at(r.max)});terms.push({label:'награда за участие: 5 наград за победу',value:5*winAmt,from:at(r.win)});}
 else if(mechanic==='pass'){terms.push({label:'10 ступеней × 3 награды за победу',value:30*winAmt||round(2*r.income),from:at(r.win)});}
 else if(mechanic==='pair'){terms.push({label:'5 парных заданий × 4 награды за победу',value:20*winAmt||round(r.income),from:at(r.win)});}
 const total=terms.reduce((n,t)=>n+t.value,0);if(!total)return null;
 const incomeDays=total/r.income;
 return {currency:r.main,total,terms,income:round(r.income),incomeDays:Math.round(incomeDays*10)/10,
  level:incomeDays>=5?'high':incomeDays>=2?'medium':'low',
  assumption:{actionsPerDay:r.actionsPerDay,winRate:r.winRate}};
}
// Competitors' recent event mentions: lines of release notes (verbatim) that name an event.
function competitorEvents(rows){
 const out=[];
 for(const g of rows||[]){
  const lines=String(g.notes||'').split(/\r?\n|(?<=[.!])\s+(?=[\p{Lu}•\-–*])/u).map(l=>l.replace(/^[\s•\-–*]+/,'').trim()).filter(l=>l.length>=12&&l.length<=300);
  for(const line of lines)if(EVENT_WORDS.test(line))out.push({game:g.name,store:g.store,date:g.day,quote:line,mechanic:mechanicOf(line),holiday:holidayOf(line),url:g.url||''});
 }
 return out.slice(0,30);
}
const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
// Ideas: one per upcoming holiday (its themed mechanic), events competitors ran that no holiday covers, and our best
// past event again. Ranked by evidence and lead time; at most `limit`.
function build({today,days=60,regions=['global'],economy=null,loop={},competitors=[],past=[],limit=6}){
 const to=H.shift(today,days);
 const r=refs(economy,loop);
 const holidays=H.upcoming(H.shift(today,7),to,regions);
 const ideas=[];
 const comp=competitorEvents(competitors);
 const used=new Set();
 for(const h of holidays){
  const base=h.id.replace(/-\d{4}$/,'');
  const mechanic=BY_THEME[h.theme]||'collect';
  const evidence=[{kind:'holiday',text:h.name+' — '+h.date,date:h.date,approx:h.approx,regions:h.regions}];
  for(const c of comp)if(c.holiday===base||c.holiday==='new-year'&&base==='christmas'||c.holiday==='christmas'&&base==='new-year'){evidence.push({kind:'competitor',...c});used.add(c);}
  for(const p of past)if(p.holiday===base||p.mechanic===mechanic&&p.uplift)evidence.push({kind:'past',name:p.name,start:p.start,end:p.end,mechanic:p.mechanic,uplift:p.uplift||null,source:p.source||null});
  const start=h.start<H.shift(today,7)?H.shift(today,7):h.start;
  ideas.push({id:h.id,title:MECHANICS[mechanic].name+': '+h.name,mechanic,holiday:base,holidayName:h.name,start,end:h.end,days:daysBetween(start,h.end),regions:h.regions,evidence,cost:cost(mechanic,daysBetween(start,h.end),r)});
 }
 // Competitor events with a mechanic and no holiday of ours: the same mechanic in two weeks, for a week.
 const seenGames=new Set();
 for(const c of comp){
  if(used.has(c)||!c.mechanic||seenGames.has(c.game+c.mechanic))continue;seenGames.add(c.game+c.mechanic);
  const start=H.shift(today,14),end=H.shift(today,20);
  ideas.push({id:'competitor-'+ideas.length,title:MECHANICS[c.mechanic].name+' — как у '+c.game,mechanic:c.mechanic,holiday:null,start,end,days:7,regions:regions,evidence:[{kind:'competitor',...c}],cost:cost(c.mechanic,7,r)});
 }
 // Our best past event (by DAU uplift) once more.
 const best=past.filter(p=>p.uplift&&p.uplift.dau!==null&&p.uplift.dau>0).sort((a,b)=>b.uplift.dau-a.uplift.dau)[0];
 if(best&&!ideas.some(i=>i.holiday&&i.holiday===best.holiday)){
  const start=H.shift(today,10),len=Math.max(3,Math.min(14,daysBetween(best.start,best.end)));
  ideas.push({id:'past-'+best.id,title:'Повторить «'+best.name+'»',mechanic:best.mechanic||'collect',holiday:best.holiday||null,start,end:H.shift(start,len-1),days:len,regions,evidence:[{kind:'past',name:best.name,start:best.start,end:best.end,mechanic:best.mechanic,uplift:best.uplift,source:best.source||null}],cost:cost(best.mechanic||'collect',len,r)});
 }
 const score=i=>i.evidence.filter(e=>e.kind==='competitor').length*3+i.evidence.filter(e=>e.kind==='past'&&e.uplift?.dau>0).length*4+(i.holiday?2:0)+(i.regions.includes('global')?1:0)-(Date.parse(i.start)-Date.parse(today))/86400000/30;
 return ideas.map(i=>({...i,about:MECHANICS[i.mechanic].pitch,score:Math.round(score(i)*100)/100})).sort((a,b)=>b.score-a.score).slice(0,limit).sort((a,b)=>a.start.localeCompare(b.start));
}
module.exports={build,cost,refs,competitorEvents,mechanicOf,holidayOf,MECHANICS,BY_THEME};
