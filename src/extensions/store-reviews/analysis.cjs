// Numbers about reviews are counted by code: the period asked for, the rating distribution, the average and its
// change against the previous period, reviews per day by rating. The model only groups complaints; its quotes are
// kept only when they are verbatim substrings of real reviews.
const DAY=86400000;

// «за месяц», «за 3 дня», «за сегодня»; a week by default, at most 90 days.
function period(text){
 const t=String(text||'').toLowerCase();
 const n=t.match(/(?:за|последни\p{L}*)\s+(\d{1,2})\s*(?:дн|сут)/u);if(n)return Math.min(90,Math.max(1,Number(n[1])));
 if(/за\s+(?:сегодня|сутки|день)|сегодняшн/u.test(t))return 1;
 if(/за\s+вчера|вчерашн/u.test(t))return 2;
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/за\s+(?:последн\p{L}*\s+)?месяц|за\s+30/u.test(t))return 30;
 if(/квартал|(?:три|3)\s+месяц/u.test(t))return 90;
 return 7;
}
// Only bad reviews, or reviews of the latest version («после обновления»).
function focus(text){
 const t=String(text||'').toLowerCase();
 const version=t.match(/верси\p{L}*\s+(\d+(?:\.\d+){1,3})/u)?.[1]||null;
 return {bad:/плох\p{L}*|негатив\p{L}*|низк\p{L}* оцен|(?:одн\p{L}*|1)\s*звезд|жалоб\p{L}*|ругают|недовол\p{L}*/u.test(t),
  update:!!version||/после\s+(?:обновлени|апдейт|релиз|выход)|нов\p{L}* верси|последн\p{L}* верси|свеж\p{L}* верси/u.test(t),version};
}
const dayKey=iso=>String(iso||'').slice(0,10);
function distribution(rows){const d={1:0,2:0,3:0,4:0,5:0};for(const r of rows)if(d[r.rating]!==undefined)d[r.rating]++;return d;}
function average(rows){const rated=rows.filter(r=>r.rating>=1&&r.rating<=5);return rated.length?Math.round(rated.reduce((n,r)=>n+r.rating,0)/rated.length*100)/100:null;}
// Reviews per day by rating, every day of the window present (empty days included).
function timeline(rows,from,to){
 const days=[];for(let t=Date.parse(dayKey(from.toISOString())+'T00:00:00Z');t<=to.getTime();t+=DAY)days.push({date:new Date(t).toISOString().slice(0,10),counts:[0,0,0,0,0]});
 for(const r of rows){const d=days.find(x=>x.date===dayKey(r.date));if(d&&r.rating>=1&&r.rating<=5)d.counts[r.rating-1]++;}
 return days;
}
// The latest version in the reviews: highest versionCode on Google Play, the newest store version on the App Store.
function latestVersion(rows,known=[]){
 const play=rows.filter(r=>r.versionCode).sort((a,b)=>b.versionCode-a.versionCode)[0];
 return {play:play?{version:play.version||String(play.versionCode),code:play.versionCode}:null,appstore:known[0]||null,previousAppstore:known[1]||null};
}
function versionCompare(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d;}return 0;}

const normalize=v=>String(v||'').replace(/\s+/g,' ').trim();
// A quote counts only when it is literally in a review (whitespace normalized), at least a few words long.
function verbatim(quote,rows){
 const q=normalize(String(quote||'').replace(/^[\s«"'“„]+|[\s»"'”]+$/gu,''));
 if(q.length<6)return null;
 for(const r of rows){for(const field of [r.text,r.title]){const hay=normalize(field);const at=hay.indexOf(q);if(at>=0)return {text:q,review:r.id};}}
 return null;
}
// Model clusters → at most 5, counts from the reviews actually assigned, quotes checked against real texts.
function clusters(raw,rows){
 const out=[];
 for(const c of (raw?.clusters||[]).slice(0,8)){
  const title=normalize(c?.title).slice(0,80);if(!title)continue;
  const ids=[...new Set((c.reviews||[]).map(Number).filter(i=>Number.isInteger(i)&&i>=1&&i<=rows.length))];
  if(!ids.length)continue;
  const members=ids.map(i=>rows[i-1]);
  const quotes=[];
  for(const q of c.quotes||[]){const found=verbatim(q,members)||verbatim(q,rows);if(found&&!quotes.some(x=>x.text===found.text))quotes.push(found);if(quotes.length===2)break;}
  out.push({title,count:ids.length,quotes,reviews:members.map(r=>r.id)});
 }
 return out.sort((a,b)=>b.count-a.count).slice(0,5);
}
// What the model sees: numbered reviews (the number is how it assigns them to clusters).
function clusterInput(rows){return rows.map((r,i)=>(i+1)+'. ['+r.rating+'★] '+(r.title?r.title+' — ':'')+r.text.slice(0,400)).join('\n');}
const CLUSTER_SCHEMA={type:'object',properties:{clusters:{type:'array',maxItems:5,items:{type:'object',properties:{title:{type:'string'},reviews:{type:'array',items:{type:'integer'}},quotes:{type:'array',items:{type:'string'},maxItems:2}},required:['title','reviews','quotes']}}},required:['clusters']};

// A language hint for the reply: Google Play gives the device language; otherwise the script of the text.
function language(r){
 if(r.language)return r.language;
 const t=r.title+' '+r.text;
 if(/[а-яё]/iu.test(t))return /[іїєґ]/iu.test(t)?'uk':'ru';
 if(/[぀-ヿ]/u.test(t))return 'ja';if(/[가-힯]/u.test(t))return 'ko';if(/[一-鿿]/u.test(t))return 'zh';
 if(/[äöüß]/iu.test(t))return 'de';if(/[ñ¿¡]/iu.test(t))return 'es';if(/[ãõç]/iu.test(t))return 'pt';if(/[ğışİ]/u.test(t))return 'tr';
 return '';
}
module.exports={DAY,period,focus,distribution,average,timeline,latestVersion,versionCompare,verbatim,clusters,clusterInput,CLUSTER_SCHEMA,language,dayKey};
