// Numbers about tickets are counted by code: open, overdue against the SLA, new today, tickets per day by status,
// problems by topic words. The model only groups problems and drafts a reply; its quotes are kept only when they are
// verbatim parts of real tickets, and a draft that promises a refund or compensation loses those sentences unless an
// active macro of the help desk offers it.
const DAY=86400000,HOUR=3600000;
const OPEN=new Set(['new','open','pending','hold']);
// The SLA clock runs while the team owes an answer: new and open. Pending waits for the player, hold for a third party.
const TICKING=new Set(['new','open']);
const normalize=v=>String(v||'').replace(/\s+/g,' ').trim();

function period(text){
 const t=String(text||'').toLowerCase();
 const n=t.match(/(?:за|последни\p{L}*)\s+(\d{1,2})\s*(?:дн|сут)/u);if(n)return Math.min(30,Math.max(1,Number(n[1])));
 if(/за\s+(?:сегодня|сутки|день)|сегодня/u.test(t))return 1;
 if(/за\s+вчера|вчера/u.test(t))return 2;
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/за\s+(?:последн\p{L}*\s+)?(?:месяц|30)/u.test(t))return 30;
 return 7;
}
// Topics players write about; `ask` is how the user names it in a request («тикеты про оплату»).
const TOPICS=[
 {id:'payment',label:'Оплата и покупки',ask:/оплат\p{L}*|плат[её]ж\p{L}*|покупк\p{L}*|деньг\p{L}*|списани\p{L}*|возврат\p{L}*|донат\p{L}*/iu,
  match:/оплат\p{L}*|плат[её]ж\p{L}*|покупк\p{L}*|купил\p{L}*|списал\p{L}*|списани\p{L}*|деньг\p{L}*|возврат\p{L}*|чек(?:а|у)?(?!\p{L})|payment|purchase|charged?|billing|refund|paid|receipt|transaction/iu},
 {id:'account',label:'Вход и аккаунт',ask:/вход\p{L}*|аккаунт\p{L}*|логин\p{L}*|пароль\p{L}*|авторизац\p{L}*/iu,
  match:/(?:^|[^\p{L}])(?:вход\p{L}*|войти|зайти|аккаунт\p{L}*|логин\p{L}*|пароль\p{L}*|привязк\p{L}*|авторизац\p{L}*|login|log in|account|password|sign in)(?=$|[^\p{L}])/iu},
 {id:'crash',label:'Вылеты и ошибки',ask:/вылет\p{L}*|крэш\p{L}*|краш\p{L}*|баг\p{L}*|ошибк\p{L}*/iu,
  match:/вылет\p{L}*|вылета\p{L}*|крэш\p{L}*|краш\p{L}*|(?:^|[^\p{L}])баг\p{L}*|ошибк\p{L}*|завис\p{L}*|не запуска\p{L}*|crash\p{L}*|(?:^|[^\p{L}])bug|error|freez\p{L}*/iu},
 {id:'progress',label:'Потеря прогресса',ask:/прогресс\p{L}*|сохранени\p{L}*/iu,
  match:/прогресс\p{L}*|сохранени\p{L}*|пропал\p{L}*|потерял\p{L}*|откатил\p{L}*|progress|lost my|save data/iu},
 {id:'cheaters',label:'Читеры и жалобы на игроков',ask:/читер\p{L}*|бан\p{L}*/iu,
  match:/читер\p{L}*|чит(?:ы|ов|ами)?(?!\p{L})|взлом\p{L}*|(?:^|[^\p{L}])бан\p{L}*|забанил\p{L}*|cheat\p{L}*|hack\p{L}*|banned/iu},
 {id:'ads',label:'Реклама',ask:/реклам\p{L}*/iu,match:/реклам\p{L}*|(?:^|[^\p{L}])ads?(?=$|[^\p{L}])|advert\p{L}*/iu}
];
const topicAsked=text=>{const t=String(text||'').replace(/поддержк\p{L}*/giu,'');return TOPICS.find(x=>x.ask.test(t))||null;};
const about=(ticket,topic)=>topic.match.test(ticket.subject+' '+ticket.text+' '+ticket.tags.join(' '));

const waitFrom=t=>Date.parse(t.status==='new'?t.created:(t.updated||t.created));
function wait(t,now){return Math.max(0,(now-waitFrom(t))/HOUR);}
// Hours left until the SLA target (negative when breached), from the help desk's SLA or the configured target.
function slaLeft(t,now,hours){
 if(!TICKING.has(t.status))return null;
 if(t.sla?.breachAt)return (Date.parse(t.sla.breachAt)-now)/HOUR;
 return hours>0?hours-wait(t,now):null;
}
const overdue=(t,now,hours)=>{const left=slaLeft(t,now,hours);return left!==null&&left<0;};
const dayKey=ms=>new Date(ms).toISOString().slice(0,10);
// Tickets created per day, split by their current status (solved and closed together).
function daily(rows,from,to){
 const days=[];for(let t=Date.parse(dayKey(from.getTime())+'T00:00:00Z');t<=to.getTime();t+=DAY)days.push({date:dayKey(t),new:0,open:0,pending:0,hold:0,solved:0});
 for(const r of rows){const d=days.find(x=>x.date===String(r.created||'').slice(0,10));if(d)d[r.status==='closed'?'solved':r.status]++;}
 return days;
}
function startOfToday(now){const d=new Date(now);d.setHours(0,0,0,0);return d.getTime();}
function tiles(rows,now,hours){
 const open=rows.filter(r=>OPEN.has(r.status));
 return {open:open.length,overdue:open.filter(r=>overdue(r,now,hours)).length,today:rows.filter(r=>Date.parse(r.created)>=startOfToday(now)).length,
  urgent:open.filter(r=>r.priority==='urgent'||r.priority==='high').length};
}

// A quote counts only when it is literally in a ticket's subject or description (whitespace normalized).
function verbatim(quote,rows){
 const q=normalize(String(quote||'').replace(/^[\s«"'“„]+|[\s»"'”]+$/gu,''));
 if(q.length<6)return null;
 for(const r of rows)for(const field of [r.subject,r.text])if(normalize(field).includes(q))return {text:q,ticket:r.id};
 return null;
}
// The sentence of a ticket that contains the topic word: a real quote without a model.
function sentenceWith(r,re){
 for(const field of [r.text,r.subject]){const parts=normalize(field).split(/(?<=[.!?…])\s+/u);const hit=parts.find(p=>re.test(p));if(hit)return hit.slice(0,200);}
 return null;
}
function plainClusters(rows){
 return TOPICS.map(t=>{const hits=rows.filter(r=>about(r,t));const quotes=[];for(const r of hits){const q=sentenceWith(r,t.match);if(q&&!quotes.some(x=>x.text===q))quotes.push({text:q,ticket:r.id});if(quotes.length===2)break;}
  return {title:t.label,count:hits.length,quotes,tickets:hits.slice(0,30).map(r=>r.id),topic:t.id};}).filter(c=>c.count).sort((a,b)=>b.count-a.count).slice(0,5);
}
const CLUSTER_SCHEMA={type:'object',properties:{clusters:{type:'array',maxItems:5,items:{type:'object',properties:{title:{type:'string'},tickets:{type:'array',items:{type:'integer'}},quotes:{type:'array',items:{type:'string'},maxItems:2}},required:['title','tickets','quotes']}}},required:['clusters']};
function clusterInput(rows){return rows.map((r,i)=>(i+1)+'. '+normalize(r.subject)+' — '+normalize(r.text).slice(0,300)).join('\n');}
function clusters(raw,rows){
 const out=[];
 for(const c of (raw?.clusters||[]).slice(0,8)){
  const title=normalize(c?.title).slice(0,80);if(!title)continue;
  const ids=[...new Set((c.tickets||[]).map(Number).filter(i=>Number.isInteger(i)&&i>=1&&i<=rows.length))];
  if(!ids.length)continue;
  const members=ids.map(i=>rows[i-1]),quotes=[];
  for(const q of c.quotes||[]){const f=verbatim(q,members)||verbatim(q,rows);if(f&&!quotes.some(x=>x.text===f.text))quotes.push(f);if(quotes.length===2)break;}
  out.push({title,count:ids.length,quotes,tickets:members.slice(0,30).map(r=>r.id)});
 }
 return out.sort((a,b)=>b.count-a.count).slice(0,5);
}

// Promises the team cannot make on its own: money back, compensation, free currency or items.
const PROMISE=/возврат\p{L}*|верн[её]м\p{L}*\s+(?:вам\s+)?(?:деньг|средств|оплат|покупк)|вернуть\s+(?:вам\s+)?(?:деньг|средств)|компенс\p{L}*|возмест\p{L}*|начисл\p{L}*|подар\p{L}*|бесплатн\p{L}*\s+(?:кристал|гем|золот|валют|монет|предмет|скин)|refund\p{L}*|compensat\p{L}*|reimburs\p{L}*|money back|free (?:gems|coins|currency|items?)/iu;
const allowsPromise=macros=>(macros||[]).some(m=>PROMISE.test(m.text||'')||PROMISE.test(m.title||''));
// Removes promise sentences unless a macro offers them; returns the text and what was removed.
function guard(text,macros){
 if(allowsPromise(macros))return {text,removed:[]};
 // Sentences and the whitespace after them alternate, so line breaks between paragraphs survive.
 const parts=String(text||'').split(/(?<=[.!?…])(\s+)/u);let out='';const removed=[];
 for(let i=0;i<parts.length;i+=2){const sentence=parts[i],gap=parts[i+1]||'';if(PROMISE.test(sentence))removed.push(sentence.trim());else out+=sentence+gap;}
 return {text:out.replace(/[ \t]+\n/g,'\n').trim(),removed};
}
module.exports={DAY,HOUR,OPEN,TICKING,period,TOPICS,topicAsked,about,wait,slaLeft,overdue,daily,tiles,verbatim,plainClusters,CLUSTER_SCHEMA,clusterInput,clusters,PROMISE,allowsPromise,guard,normalize};
