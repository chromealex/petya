// Checks of a candidate name done by code: length and character set, transliteration ru↔en, simple
// pronunciation notes, and how close two names are (exact / similar), also across scripts («Гномгард» = «Gnomgard»).
const RU2EN={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
// Latin read the way a Russian speaker would say it: digraphs first, then letters.
const EN2RU=[['sch','ш'],['tch','ч'],['shch','щ'],['sh','ш'],['ch','ч'],['zh','ж'],['kh','х'],['ts','ц'],['th','т'],['ph','ф'],['ck','к'],['qu','кв'],['oo','у'],['ee','и'],['ea','и'],['ou','ау'],['ay','эй'],['ey','эй'],['oy','ой'],['yo','ё'],['yu','ю'],['ya','я'],['ye','е'],
 ['a','а'],['b','б'],['c','к'],['d','д'],['e','е'],['f','ф'],['g','г'],['h','х'],['i','и'],['j','дж'],['k','к'],['l','л'],['m','м'],['n','н'],['o','о'],['p','п'],['q','к'],['r','р'],['s','с'],['t','т'],['u','у'],['v','в'],['w','у'],['x','кс'],['y','и'],['z','з']];
const CYR=/[а-яё]/i,LAT=/[a-z]/i;
const letters=s=>[...String(s)];

function script(name){const c=CYR.test(name),l=LAT.test(name);return c&&l?'mixed':c?'cyrillic':l?'latin':'other';}
function toLatin(text){return String(text).split('').map(ch=>{const low=ch.toLowerCase(),t=RU2EN[low];if(t===undefined)return ch;return ch!==low&&t?t[0].toUpperCase()+t.slice(1):t;}).join('');}
function toCyrillic(text){
 let out='',s=String(text);
 for(let i=0;i<s.length;){
  const rest=s.slice(i).toLowerCase();
  const hit=EN2RU.find(([en])=>rest.startsWith(en));
  if(!hit){out+=s[i];i++;continue;}
  // «c» before e/i/y sounds like «с»; a trailing «e» after a consonant is silent (Stone → Стоун is out of reach).
  let ru=hit[1];
  if(hit[0]==='c'&&/^[eiy]/.test(rest.slice(1)))ru='с';
  if(hit[0]==='e'&&i===s.length-1&&i>2&&/[^aeiou]/i.test(s[i-1]))ru='';
  const upper=s[i]!==s[i].toLowerCase();
  out+=upper&&ru?ru[0].toUpperCase()+ru.slice(1):ru;i+=hit[0].length;
 }
 return out;
}
// Compare form: lower case, ё → е, letters and digits only, in Latin.
function key(name){return toLatin(String(name).toLowerCase().replace(/ё/g,'е')).toLowerCase().replace(/[^a-z0-9]/g,'');}
function distance(a,b){
 if(a===b)return 0;if(!a.length)return b.length;if(!b.length)return a.length;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(prev[j]+1,row[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}
 return prev[b.length];
}
// 'exact' | 'similar' | null for a candidate against an existing name. `contains` also counts an existing name
// that holds the candidate as a separate word (or a code identifier that starts with it).
function compare(candidate,existing,{contains=true}={}){
 const a=key(candidate),b=key(existing);
 if(!a||!b)return null;
 if(a===b)return 'exact';
 const near=a.length>=8?2:a.length>=4?1:0;
 if(near&&Math.abs(a.length-b.length)<=near&&distance(a,b)<=near)return 'similar';
 if(contains&&a.length>=4&&b.length>a.length){
  const words=String(existing).toLowerCase().replace(/ё/g,'е').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(key);
  if(words.includes(a)||b.startsWith(a)&&b.length<=a.length+14)return 'similar';
  // A multi-word candidate inside a longer existing name («Сундук удачи» in «Открыть сундук удачи»).
  if(/\s/.test(String(candidate).trim())&&b.includes(a))return 'similar';
 }
 return null;
}
// The main title of a store listing: «Bunker Wars: WW1 RTS» → «Bunker Wars».
const title=text=>String(text||'').split(/\s[-–—|]\s|:\s/u)[0].trim();

// Length, characters and pronunciation notes for one candidate; `limit` is the requested maximum length.
function inspect(name,{kind='',limit=0}={}){
 const text=String(name||'').trim();
 const length=letters(text).length,words=text.split(/\s+/).filter(Boolean).length,sc=script(text);
 const notes=[],warnings=[];
 if(sc==='mixed')warnings.push('смешаны кириллица и латиница — в поиске и сторах это разные буквы');
 if(/[^\p{L}\p{N}\s'’\-:&!.]/u.test(text))warnings.push('необычные символы');
 if(limit&&length>limit)warnings.push('длиннее '+limit+' символов');
 if(kind==='game'&&length>30)warnings.push('длиннее 30 символов — не поместится в название приложения в App Store и Google Play');
 if(/(?:^|\s)\d/.test(text)&&kind!=='game')notes.push('цифры в имени плохо произносятся вслух');
 let translit='';
 if(sc==='cyrillic'){
  translit=toLatin(text);
  const hard=[...new Set((text.toLowerCase().match(/[ыщжхц]/g)||[]))];
  if(hard.length)notes.push('для англоязычных трудны: '+hard.join(', ')+' (латиницей — '+translit+')');
 }else if(sc==='latin'){
  translit=toCyrillic(text);
  const lower=text.toLowerCase(),hard=[];
  if(/th/.test(lower))hard.push('th прочтут как «т» или «з»');
  if(/w/.test(lower))hard.push('w прочтут как «в» или «у»');
  if(/ough|augh/.test(lower))hard.push('ough/augh читается неоднозначно');
  if(/(?:^|[^aeiou])c(?=[eiy])/.test(lower)&&/c(?=[aou]|$)/.test(lower))hard.push('c читается то как «к», то как «с»');
  if(hard.length)notes.push('по-русски: '+hard.join('; '));
 }
 const cluster=/[бвгджзйклмнпрстфхцчшщ]{4,}|[bcdfghjklmnpqrstvwxz]{4,}/iu.exec(text.replace(/\s+/g,' '));
 if(cluster&&!/(?:sch|tch|ch|sh|th|ph|ck)/i.test(cluster[0]))notes.push('стечение согласных «'+cluster[0]+'» трудно произнести');
 return {name:text,length,words,script:sc,translit,notes,warnings};
}
module.exports={inspect,compare,key,distance,toLatin,toCyrillic,script,title};
