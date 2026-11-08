// Google Play facts of a competitor. Google Play has no official API for other developers' apps, so Petya asks its
// own web search engine (src/web-search.cjs, «Поиск в интернете») and keeps only what the answer states next to a
// source on play.google.com: version, rating, update date. The figures are marked as found by search; without the
// web module (or without a Play page among the sources) the app is skipped with a note, never guessed.
const PACKAGE=/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;
// «https://play.google.com/store/apps/details?id=com.supercell.clashofclans&hl=ru» → package.
function fromUrl(text){const m=String(text||'').match(/https?:\/\/play\.google\.com\/store\/apps\/details\?(?:[^\s#]*&)?id=([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)/);return m?m[1]:null;}
const available=s=>{try{return !!s.webSearchEngine&&s.webSearchEngine.enabled?.()!==false;}catch{return false;}};

const MONTHS={январ:0,феврал:1,март:2,апрел:3,ма:4,июн:5,июл:6,август:7,сентябр:8,октябр:9,ноябр:10,декабр:11,jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function date(text){
 const t=String(text||'');
 let m=t.match(/(\d{1,2})\s+([а-яё]+|[a-z]+)\.?\s+(\d{4})/i);
 if(m){const key=Object.keys(MONTHS).filter(k=>m[2].toLowerCase().startsWith(k)).sort((a,b)=>b.length-a.length)[0];if(key!==undefined)return new Date(Date.UTC(+m[3],MONTHS[key],+m[1])).toISOString();}
 m=t.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})/i);
 if(m&&MONTHS[m[1].toLowerCase()]!==undefined)return new Date(Date.UTC(+m[3],MONTHS[m[1].toLowerCase()],+m[2])).toISOString();
 m=t.match(/(\d{4})-(\d{2})-(\d{2})/)||t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
 if(m)return m[1].length===4?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toISOString():new Date(Date.UTC(+m[3],+m[2]-1,+m[1])).toISOString();
 return null;
}
// Facts stated in the search answer, each only when the answer states it.
function facts(text){
 const t=String(text||'').replace(/\s+/g,' ');
 const version=t.match(/(?:верси\p{L}*|version)\s*(?:[:—–-]|—|это|is)?\s*v?(\d+(?:\.\d+){1,3})/iu)?.[1]||'';
 const rating=t.match(/(?:рейтинг\p{L}*|оценк\p{L}*|rating|rated)\D{0,25}?([1-5][.,]\d{1,2})/iu)?.[1];
 const updatedText=t.match(/(?:обновлен\p{L}*|обновлени\p{L}*|updated|update)\D{0,20}((?:\d{1,2}\s+[а-яёa-z]+\.?\s+\d{4})|(?:[a-z]{3,9}\.?\s+\d{1,2},\s+\d{4})|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/iu)?.[1]||'';
 return {version,rating:rating?Number(rating.replace(',','.')):null,updated:date(updatedText)};
}
async function lookup(s,pkg,name){
 if(!PACKAGE.test(pkg))throw Error('Некорректный пакет Google Play.');
 if(!available(s))return {skipped:true,note:'Google Play: у магазина нет открытого API, а «Поиск в интернете» выключен — данные Google Play не обновлены.'};
 const r=await s.webSearchEngine.search((name?name+' ':'')+pkg+' Google Play текущая версия рейтинг дата обновления');
 const play=(r?.sources||[]).filter(x=>/^https:\/\/play\.google\.com\//.test(String(x.url||'')));
 if(!play.length)return {skipped:true,note:'Google Play: поиск не нашёл страницу '+pkg+' — данные не обновлены.'};
 const f=facts(r.text);
 return {key:'play:'+pkg,store:'play',id:pkg,name:name||pkg,version:f.version,rating:f.rating,updated:f.updated,notes:'',ratings:null,size:null,price:null,
  url:'https://play.google.com/store/apps/details?id='+pkg,web:{verified:!!r.verified,sources:play.slice(0,3).map(x=>({title:String(x.title||'').slice(0,200),url:x.url}))}};
}
module.exports={lookup,fromUrl,facts,date,available,PACKAGE};
