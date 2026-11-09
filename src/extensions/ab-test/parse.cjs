// «A/B-тесты»: numbers from the request, a pasted table or an attached CSV — by code, without the model.
// Result: {metric:'conversion'|'mean', variants:[{name, users, conversions?} | {name, users, mean, sd} | {name, values}],
//  split?, dailyTraffic?, days?, mde?, peeking?} or null when nothing usable was found.
const LABEL='(?:[Гг]руппа\\s+|[Вв]ариант\\s+|[Vv]ariant\\s+|[Gg]roup\\s+)?([A-Da-dА-Га-г]|[Кк]онтрол\\p{L}*|[Cc]ontrol|[Тт]ест(?:овая)?)';
const NUMBER=/\d+(?:[.,]\d+)?/gu;

// «12 000», «12 000» (thin / no-break spaces) → «12000»; a plain space joins only before a unit word or the end,
// so «980 и 141» and «1000 120» stay two numbers.
function joinThousands(text){
 return String(text||'').replace(/(\d{1,3})(?:[   ](\d{3}))+(?!\d)/gu,m=>m.replace(/[   ]/g,''))
  .replace(/(?<![\d.,])(\d{1,3})((?: \d{3})+)(?=\s*(?:игрок|пользовател|юзер|человек|конверси|покуп|установ|$|[;,.)\n]))/gu,(m,a,b)=>a+b.replace(/ /g,''));
}
const num=s=>Number(String(s).replace(',','.'));
const canonical=name=>{const n=String(name).trim();if(/^[a-dа-г]$/iu.test(n))return ({'а':'A','б':'B','в':'C','г':'D'})[n.toLowerCase()]||n.toUpperCase();if(/^(?:контрол|control)/iu.test(n))return 'A';if(/^тест/iu.test(n))return 'B';return n;};

// One variant's text: «1000 игроков 120 конверсий», «120 из 1000», «1000 и 141», «12% из 1000», «среднее 5.2, sd 1.1, n 500».
function variantNumbers(part){
 const t=part.toLowerCase();
 const mean=t.match(/(?:среднее|средний чек|mean|avg|ср\.)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/u),sd=t.match(/(?:sd|ст\.?\s*откл\p{L}*|стандартное отклонение|σ|std)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/u);
 const n=t.match(/(?:^|[^\p{L}])n\s*[=:]?\s*(\d+)/u)||t.match(/(\d+)\s*(?:игрок|пользовател|юзер|человек)/u);
 if(mean&&sd&&n)return {users:num(n[1]),mean:num(mean[1]),sd:num(sd[1])};
 const of=t.match(/(\d+(?:[.,]\d+)?)\s*(%?)\s*(?:из|of|\/)\s*(\d+)(?![\d.,]*\s*%)/u);
 if(of){
  // «120 из 1000»; with a slash the larger number is the group size («1000/120» and «120/1000» both mean 120 of 1000).
  let a=num(of[1]),b=num(of[3]);if(!of[2]&&/\//.test(of[0])&&a>b)[a,b]=[b,a];
  return {users:b,conversions:of[2]?Math.round(a*b/100):a};
 }
 const nums=[...t.matchAll(NUMBER)].map(m=>({v:num(m[0]),pct:t.slice(m.index+m[0].length).trimStart().startsWith('%'),at:m.index}));
 if(nums.length<2)return nums.length===1&&!nums[0].pct?{users:nums[0].v}:null;
 let [a,b]=nums;
 // «120 конверсий, 1000 игроков»: the users number is the one followed by a users word.
 const after=x=>t.slice(x.at).replace(/^\d+(?:[.,]\d+)?\s*/u,'');
 if(/^(?:конверси|покуп|платеж|успех|клик|установ|install|conv)/u.test(after(a))&&/^(?:игрок|пользовател|юзер|человек|user)/u.test(after(b)))[a,b]=[b,a];
 if(b.pct)return {users:a.v,conversions:Math.round(a.v*b.v/100)};
 if(a.pct)return {users:b.v,conversions:Math.round(b.v*a.v/100)};
 return {users:a.v,conversions:b.v};
}

function fromText(text){
 const t=joinThousands(text);
 // «A: …», «группа B — …»; a bare «A 50000» only for Latin capitals (Cyrillic «в 10» is a preposition).
 const re=new RegExp('(?:^|[\\s,;(\\n])(?:'+LABEL+'\\s*[:—–=-]\\s*|([A-D])\\s+(?=\\d))','gu');
 const marks=[...t.matchAll(re)];
 if(marks.length<2)return null;
 const variants=[];
 marks.forEach((m,i)=>{
  const part=t.slice(m.index+m[0].length,i+1<marks.length?marks[i+1].index:undefined);
  const v=variantNumbers(part);if(v)variants.push({name:canonical(m[1]||m[2]),...v});
 });
 if(variants.length<2)return null;
 const metric=variants.every(v=>'mean' in v)?'mean':variants.every(v=>'conversions' in v)?'conversion':variants.every(v=>Object.keys(v).length===2)?'assignment':null;
 return metric?{metric,variants}:null;
}

// Tables: pasted text or CSV with a header. Either one row per variant (variant, users, conversions | mean, sd)
// or one row per user (variant, value) — then values are kept for Welch and bootstrap.
const H={variant:/^(?:variant|group|вариант|группа|arm|bucket|ветка|cohort)$/iu,users:/^(?:users|n|count|игроки|игроков|пользователи|участники|size|visitors|devices|assigned)$/iu,
 conversions:/^(?:conversions?|конверси\p{L}*|conv|purchases?|покупки|payers|плательщики|success|успехи|converted)$/iu,
 mean:/^(?:mean|avg|average|среднее)$/iu,sd:/^(?:sd|std|stdev|stddev|σ|отклонение)$/iu,value:/^(?:value|revenue|выручка|amount|сумма|arpu|доход|значение|metric|метрика|converted_flag|retained|d1|d7)$/iu};
function splitRow(line,sep){return line.split(sep).map(c=>c.trim().replace(/^"(.*)"$/s,'$1'));}
function fromTable(text){
 const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 for(let start=0;start<lines.length-2;start++){
  const head=lines[start];const sep=head.includes('\t')?'\t':head.includes(';')?';':head.includes(',')?',':head.includes('|')?'|':null;
  if(!sep)continue;
  const cols=splitRow(head,sep).map(c=>c.replace(/\|/g,'').trim()).filter((c,i,a)=>!(sep==='|'&&!c&&(i===0||i===a.length-1)));
  const find=key=>cols.findIndex(c=>H[key].test(c));
  const vi=find('variant');if(vi<0)continue;
  const rows=lines.slice(start+1).filter(l=>!/^[-|:\s]+$/.test(l)).map(l=>splitRow(l,sep).filter((c,i,a)=>!(sep==='|'&&!c&&(i===0||i===a.length-1))));
  const ui=find('users'),ci=find('conversions'),mi=find('mean'),si=find('sd'),xi=find('value');
  if(ui>=0&&(ci>=0||mi>=0&&si>=0)){
   const variants=rows.filter(r=>r[vi]&&Number.isFinite(num(r[ui]))).map(r=>ci>=0?{name:r[vi],users:num(r[ui]),conversions:num(r[ci])}:{name:r[vi],users:num(r[ui]),mean:num(r[mi]),sd:num(r[si])});
   if(variants.length>=2)return {metric:ci>=0?'conversion':'mean',variants,source:'table'};
  }
  if(xi>=0){
   const by=new Map();
   for(const r of rows){const v=num(r[xi]);if(!r[vi]||!Number.isFinite(v))continue;if(!by.has(r[vi]))by.set(r[vi],[]);by.get(r[vi]).push(v);}
   const variants=[...by].map(([name,values])=>({name,values}));
   if(variants.length>=2&&variants.every(v=>v.values.length>=2)){
    // 0/1 values are conversions.
    if(variants.every(v=>v.values.every(x=>x===0||x===1)))return {metric:'conversion',variants:variants.map(v=>({name:v.name,users:v.values.length,conversions:v.values.filter(x=>x===1).length})),source:'rows'};
    return {metric:'mean',variants,source:'rows'};
   }
  }
 }
 return null;
}

// Extra facts in the request: planned split, daily traffic, days running, MDE, peeking.
function extras(text){
 const t=joinThousands(text).toLowerCase(),out={};
 const split=t.match(/(?:разбиени\p{L}*|сплит\p{L}*|split|распределени\p{L}*|делим|поделен\p{L}*)\D{0,12}(\d{1,2})\s*[/:]\s*(\d{1,2})(?:\s*[/:]\s*(\d{1,2}))?(?:\s*[/:]\s*(\d{1,2}))?/u)||t.match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{1,2}))?\s*(?:сплит|split|разбиени)/u);
 if(split){const w=split.slice(1).filter(Boolean).map(Number);if(w.every(x=>x>0))out.split=w;}
 const daily=t.match(/(\d+(?:[.,]\d+)?)\s*(?:тыс\.?\s*)?(?:игрок\p{L}*|пользовател\p{L}*|юзер\p{L}*|человек|установ\p{L}*|новых)?\s*(?:в|за|\/)\s*(?:день|сутки)/u)||t.match(/(?:в день|ежедневно|daily)\D{0,15}(\d+(?:[.,]\d+)?)/u);
 if(daily){out.dailyTraffic=num(daily[1])*(/тыс/.test(daily[0])?1000:1);}
 const days=t.match(/(?:ид[её]т|идёт уже|длится|крутится|running|уже)\s*(\d{1,3})\s*(?:дн|день|дня|сут)/u)||t.match(/(\d{1,3})\s*(?:дн\p{L}*|день|дня)\s*(?:теста|идёт|идет)/u)||t.match(/за\s*(\d{1,3})\s*(?:дн\p{L}*|день|дня)/u);
 if(days)out.days=Number(days[1]);
 const mde=t.match(/(?:mde|мде|минимальн\p{L}* (?:эффект|разниц\p{L}*|изменени\p{L}*|аплифт)|аплифт|uplift|эффект)\D{0,10}(\d+(?:[.,]\d+)?)\s*%/u);
 if(mde)out.mde=num(mde[1])/100;
 const alpha=t.match(/(?:alpha|альфа|уровень значимости|α)\s*[=:]?\s*(0[.,]\d+)/u);
 if(alpha){const a=num(alpha[1]);if(a>0&&a<0.5)out.alpha=a;}
 if(/подгляд|каждый день (?:смотр|провер)|провер\p{L}* каждый день|смотр\p{L}* каждый день|можно (?:ли )?(?:останов|выключ|заверш)|останов\p{L}* (?:тест|сейчас|раньше)|peek/u.test(t))out.peeking=true;
 return out;
}

// Every number shown must come from the text: a model extraction keeps only numbers that literally occur in it.
function numbersIn(text){return new Set([...joinThousands(text).matchAll(NUMBER)].map(m=>num(m[0])));}

module.exports={fromText,fromTable,extras,joinThousands,variantNumbers,numbersIn,canonical};
