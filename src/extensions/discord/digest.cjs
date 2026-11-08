// What players say in Discord, counted by code: messages per channel and per day, unread since the last digest,
// questions and bug reports found by words. The local model only groups messages into themes and drafts FAQ
// answers; its quotes are kept only when they are verbatim parts of real messages, and an answer is kept only when it
// names the pinned message it is based on.
const DAY=86400000;
const normalize=v=>String(v||'').replace(/\s+/g,' ').trim();
const norm=v=>normalize(v).toLowerCase().replace(/ё/g,'е');

// «за неделю», «за 3 дня», «за сегодня»; null when the request names no period.
function period(text){
 const t=norm(text);
 const n=t.match(/(?:за|последни\p{L}*)\s+(\d{1,2})\s*(?:дн|сут)/u);if(n)return Math.min(30,Math.max(1,Number(n[1])));
 if(/за\s+(?:сегодня|сутки|день)|сегодня/u.test(t))return 1;
 if(/за\s+вчера|вчера/u.test(t))return 2;
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/за\s+(?:последн\p{L}*\s+)?(?:месяц|30)/u.test(t))return 30;
 if(/недел/u.test(t))return 7;
 return null;
}
// What the request is about: bugs, frequent questions, or the general digest.
function mode(text){
 const t=norm(text);
 if(/баг|ошибк|вылет|крэш|краш|bug|crash|глюк|не работает у игрок/u.test(t))return 'bugs';
 if(/частые вопрос|часто спрашива|faq|вопрос\p{L}* игрок|что спрашива/u.test(t))return 'faq';
 return 'digest';
}

// Words that mark a bug report or a question when no model is chosen.
const BUG=/(?:^|[^\p{L}])(?:баг\p{L}*|bug\p{L}*|вылет\p{L}*|вылета\p{L}*|крэш\p{L}*|краш\p{L}*|crash\p{L}*|завис\p{L}*|фриз\p{L}*|freez\p{L}*|лага\p{L}*|глюч\p{L}*|глюк\p{L}*|не (?:работает|грузит\p{L}*|запускает\p{L}*|открывает\p{L}*|могу (?:зайти|войти))|ошибк\p{L}*|error|broken|сломал\p{L}*|пропал\p{L}*|не приш\p{L}*)(?=$|[^\p{L}])/iu;
const QUESTION=/\?\s*$|(?:^|[^\p{L}])(?:как|когда|где|почему|зачем|можно ли|есть ли|будет ли|what|when|how|why|where|is there|can i)(?=$|[^\p{L}])/iu;
const POSITIVE=/(?:^|[^\p{L}])(?:спасибо|класс\p{L}*|круто|отличн\p{L}*|супер|нрав\p{L}*|обожаю|любл\p{L}*|топ|лучш\p{L}*|thanks|love|great|awesome|nice|gg)(?=$|[^\p{L}])/iu;
const NEGATIVE=/(?:^|[^\p{L}])(?:ужас\p{L}*|отстой|бесит|бесят|верните|плох\p{L}*|скучн\p{L}*|донат\p{L}*|разочар\p{L}*|удалил\p{L}*|hate|worst|trash|boring|refund)(?=$|[^\p{L}])/iu;

// Messages players wrote: no bots, no system messages, no empty texts.
const human=m=>!m.bot&&(m.type===0||m.type===19)&&!!normalize(m.text);
// Without MESSAGE CONTENT the API returns other people's messages with empty text and no attachments.
function contentHidden(rows){
 const people=rows.filter(m=>!m.bot&&(m.type===0||m.type===19));
 const empty=people.filter(m=>!normalize(m.text)&&!m.attachments&&!m.embeds&&!m.stickers).length;
 return people.length>=3&&empty/people.length>0.6;
}
const dayKey=iso=>String(iso||'').slice(0,10);
// Messages per day, every day of the window present.
function activity(rows,from,to){
 const days=[];for(let t=Date.parse(dayKey(from.toISOString())+'T00:00:00Z');t<=to.getTime();t+=DAY)days.push({date:new Date(t).toISOString().slice(0,10),count:0,bugs:0});
 for(const m of rows){const d=days.find(x=>x.date===dayKey(m.at));if(d){d.count++;if(BUG.test(m.text))d.bugs++;}}
 return days;
}
// −1…1 by words: a rough mood when no model is chosen.
function wordMood(rows){
 let p=0,n=0;for(const m of rows){if(POSITIVE.test(m.text))p++;if(NEGATIVE.test(m.text)||BUG.test(m.text))n++;}
 return p+n?Math.round((p-n)/(p+n)*100)/100:0;
}

// A quote counts only when it is literally in a message (whitespace normalized), at least a few characters long.
function verbatim(quote,rows){
 const q=normalize(String(quote||'').replace(/^[\s«"'“„]+|[\s»"'”]+$/gu,''));
 if(q.length<6)return null;
 for(const m of rows)if(normalize(m.text).includes(q))return {text:q,message:m};
 return null;
}
const SENTIMENT={negative:-1,neutral:0,positive:1};
const KINDS=['bug','question','feedback','praise','other'];
const CLUSTER_SCHEMA={type:'object',properties:{clusters:{type:'array',maxItems:6,items:{type:'object',properties:{
 title:{type:'string'},kind:{type:'string',enum:KINDS},sentiment:{type:'string',enum:Object.keys(SENTIMENT)},
 messages:{type:'array',items:{type:'integer'}},quotes:{type:'array',items:{type:'string'},maxItems:2}},required:['title','kind','sentiment','messages','quotes']}}},required:['clusters']};
const FAQ_SCHEMA={type:'object',properties:{faq:{type:'array',maxItems:6,items:{type:'object',properties:{
 question:{type:'string'},messages:{type:'array',items:{type:'integer'}},pin:{type:'integer'},answer:{type:'string'}},required:['question','messages','pin','answer']}}},required:['faq']};

// What the model sees: numbered messages (the number is how it assigns them).
function numbered(rows,names){return rows.map((m,i)=>(i+1)+'. [#'+(names[m.channel]||m.channel)+'] '+m.author+': '+normalize(m.text).slice(0,300)).join('\n');}
const link=m=>({text:'',url:m.url,author:m.author,channel:m.channel,id:m.id});

// Model clusters → at most 6, counts from the messages actually assigned, quotes checked against real texts.
function clusters(raw,rows){
 const out=[];
 for(const c of (raw?.clusters||[]).slice(0,8)){
  const title=normalize(c?.title).slice(0,80);if(!title)continue;
  const ids=[...new Set((c.messages||[]).map(Number).filter(i=>Number.isInteger(i)&&i>=1&&i<=rows.length))];
  if(!ids.length)continue;
  const members=ids.map(i=>rows[i-1]);
  const quotes=[];
  for(const q of c.quotes||[]){const f=verbatim(q,members)||verbatim(q,rows);if(f&&!quotes.some(x=>x.text===f.text))quotes.push({...link(f.message),text:f.text});if(quotes.length===2)break;}
  // A theme without a checkable quote still shows its first message, cut, as a link — never invented text.
  if(!quotes.length){const m=members[0];quotes.push({...link(m),text:normalize(m.text).slice(0,160)});}
  out.push({title,kind:KINDS.includes(c.kind)?c.kind:'other',sentiment:SENTIMENT[c.sentiment]??0,count:ids.length,quotes,messages:members.slice(0,20).map(link)});
 }
 return out.sort((a,b)=>b.count-a.count).slice(0,6);
}
// FAQ: an answer stays only when it is based on a real pinned message (by its number); otherwise it is left empty.
function faq(raw,rows,pinned){
 const out=[];
 for(const f of (raw?.faq||[]).slice(0,8)){
  const question=normalize(f?.question).slice(0,160);if(!question)continue;
  const ids=[...new Set((f.messages||[]).map(Number).filter(i=>Number.isInteger(i)&&i>=1&&i<=rows.length))];
  if(!ids.length)continue;
  const members=ids.map(i=>rows[i-1]).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const pin=Number.isInteger(f.pin)&&f.pin>=1&&f.pin<=pinned.length?pinned[f.pin-1]:null;
  const answer=pin?normalize(f.answer).slice(0,1500):'';
  out.push({question,count:ids.length,answer,pin:pin&&answer?{url:pin.url,text:normalize(pin.text).slice(0,200),channel:pin.channel}:null,
   latest:{...link(members[0]),text:normalize(members[0].text).slice(0,200)},channel:members[0].channel,thread:members[0].thread||null,messages:members.slice(0,10).map(link)});
 }
 return out.sort((a,b)=>b.count-a.count).slice(0,6);
}

// Without a model: questions grouped by shared words, bug reports by words. Texts are the real messages.
const STOP=new Set('как когда где почему зачем можно есть будет ли что это the a an is are to how when what why where и в на с по за не а у я мы вы они он она оно мне мой моя ещё уже там тут'.split(' '));
const words=t=>new Set(norm(t).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.slice(0,6)));
function plainFaq(rows){
 const groups=[];
 for(const m of rows.filter(r=>QUESTION.test(r.text))){
  const w=words(m.text);if(!w.size)continue;
  const g=groups.find(x=>{let common=0;for(const v of w)if(x.words.has(v))common++;return common>=2||(common>=1&&Math.min(w.size,x.words.size)<=2);});
  if(g){g.items.push(m);for(const v of w)g.words.add(v);}else groups.push({words:w,items:[m]});
 }
 return groups.filter(g=>g.items.length>=1).sort((a,b)=>b.items.length-a.items.length).slice(0,6).map(g=>{
  const latest=[...g.items].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
  return {question:normalize(g.items[0].text).slice(0,160),count:g.items.length,answer:'',pin:null,latest:{...link(latest),text:normalize(latest.text).slice(0,200)},channel:latest.channel,thread:latest.thread||null,messages:g.items.slice(0,10).map(link)};
 });
}
function plainBugs(rows){
 return rows.filter(m=>BUG.test(m.text)).slice(0,8).map(m=>({...link(m),text:normalize(m.text).slice(0,240),at:m.at}));
}

module.exports={DAY,period,mode,BUG,QUESTION,human,contentHidden,activity,wordMood,verbatim,clusters,faq,numbered,plainFaq,plainBugs,CLUSTER_SCHEMA,FAQ_SCHEMA,SENTIMENT,normalize};
