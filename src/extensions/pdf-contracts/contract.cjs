// «Договоры в PDF»: what a contract says, found by code in the text of its pages — clauses by numbering, the parties
// («именуемое в дальнейшем «Заказчик»»), the number and the signing date, the price, payment terms, the term,
// auto-renewal, termination, penalties and IP / licensing. Every field quotes one sentence of the contract verbatim
// with its page; `verify` re-checks any quote (also the model's) against the page text, tolerant only to spacing,
// line-break hyphenation, quote marks, dashes and ё. Deadlines (the end of the term, the last day to refuse renewal,
// payment dates) are computed from those quotes. `compare` diffs two versions clause by clause, word by word.
const MONTHS=['январ','феврал','март','апрел','ма[йя]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const EN_MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const NBSP=/[   ]/g;

// --- Text helpers ------------------------------------------------------------------------------------------------------
// Matching ignores spacing, hyphens at line breaks and inside words, quote styles, dashes and ё.
function norm(s){
 return String(s||'').replace(/­/g,'').replace(NBSP,' ').replace(/[«»“”„‟"]/g,'"').replace(/[‘’‚‛`]/g,"'").replace(/[‐‑‒–—―−-]/g,'-')
  .replace(/ё/g,'е').replace(/Ё/g,'Е').replace(/\s*-\s*/g,'').replace(/\s+/g,' ').trim().toLowerCase();
}
function joinLines(lines){
 let out='';
 for(const raw of lines){const l=raw.trim();if(!l)continue;if(!out){out=l;continue;}
  if(/[\p{L}]-$/u.test(out))out+=l;else out+=' '+l;}
 return out;
}
const ABBR=/(?:^|[\s(])(?:г|гг|руб|коп|т\.\s?е|т\.\s?к|т\.\s?ч|т\.\s?п|т\.\s?д|п|пп|ст|ч|д|ул|им|см|рис|тыс|млн|млрд|No|N|др|пр|напр|стр|вкл|прим|абз|подп|ред|изм|прил|max|min|Mr|Ms|Mrs|Inc|Ltd|Co|No)\.$/u;
function sentences(text){
 const out=[];let start=0;const re=/[.!?;](?=\s+[«"(\p{Lu}\d])/gu;let m;
 while((m=re.exec(text))){const end=m.index+1;const piece=text.slice(start,end);if(ABBR.test(piece.slice(-8)))continue;if(/\d\.$/.test(piece)&&/^\s+\d/.test(text.slice(end)))continue;out.push({text:piece.trim(),at:start});start=end;}
 if(start<text.length&&text.slice(start).trim())out.push({text:text.slice(start).trim(),at:start});
 return out.filter(x=>x.text.length>=3);
}

// --- Values ------------------------------------------------------------------------------------------------------------
const pad=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>{const t=Date.UTC(y,m-1,d);const x=new Date(t);return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?y+'-'+pad(m)+'-'+pad(d):null;};
const DATE_RU=new RegExp('[«"]?(\\d{1,2})[»"]?\\s+('+MONTHS.join('|')+')\\p{L}*\\s+(\\d{4})(?:\\s*(?:г\\.|года|г(?=\\s|$)))?','giu');
const DATE_NUM=/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*г\.)?/g;
const DATE_EN=new RegExp('(?:('+EN_MONTHS.join('|')+')\\s+(\\d{1,2}),?\\s+(\\d{4})|(\\d{1,2})(?:st|nd|rd|th)?\\s+('+EN_MONTHS.join('|')+')\\s+(\\d{4}))','gi');
function dates(text){
 const out=[];let m;
 for(const re of [DATE_RU,DATE_NUM,DATE_EN]){re.lastIndex=0;
  while((m=re.exec(text))){
   let d=null;
   if(re===DATE_RU){const mi=MONTHS.findIndex(x=>new RegExp('^'+x,'iu').test(m[2]));d=iso(Number(m[3]),mi+1,Number(m[1]));}
   else if(re===DATE_NUM)d=iso(Number(m[3]),Number(m[2]),Number(m[1]));
   else{const name=(m[1]||m[5]).toLowerCase();d=iso(Number(m[3]||m[6]),EN_MONTHS.indexOf(name)+1,Number(m[2]||m[4]));}
   if(d)out.push({date:d,text:m[0],at:m.index});
  }}
 return out.sort((a,b)=>a.at-b.at);
}
const CUR=[[/^(?:рубл\p{L}*|руб\.?|₽|rub|рос\.?\s*руб\p{L}*)$/iu,'RUB'],[/^(?:долл\p{L}*(?:\s*сша)?|usd|\$|us\$)$/iu,'USD'],[/^(?:евро|eur|€)$/iu,'EUR']];
const curOf=w=>{for(const [re,c] of CUR)if(re.test(String(w).trim()))return c;return null;};
function amounts(text){
 const out=[];let m;
 const A=/(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:\([^)]{2,160}\)\s*)?(рубл\p{L}*|руб\.?|₽|RUB|долл\p{L}*(?:\s*США)?|USD|евро|EUR|€)(?![\p{L}])/giu;
 while((m=A.exec(text))){const v=Number(m[1].replace(/[\s  ]/g,'')+(m[2]?'.'+m[2]:''));if(v>0)out.push({amount:v,currency:curOf(m[3]),text:m[0],at:m.index});}
 const B=/(USD|EUR|\$|€)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;
 while((m=B.exec(text))){const v=Number(m[2].replace(/,/g,'')+(m[3]?'.'+m[3]:''));if(v>0)out.push({amount:v,currency:curOf(m[1]),text:m[0],at:m.index});}
 return out.sort((a,b)=>a.at-b.at);
}
const percents=text=>[...String(text).matchAll(/(\d+(?:[,.]\d+)?)\s*(?:\([^)]{2,60}\)\s*)?(?:%|процент\p{L}*|percent)/giu)].map(m=>({value:Number(m[1].replace(',','.')),at:m.index}));
function periods(text){
 const out=[];
 for(const m of String(text).matchAll(/(\d{1,3})\s*(?:\([^)]{2,60}\)\s*)?(рабоч\p{L}*|банковск\p{L}*|календарн\p{L}*|business|calendar|working|banking)?\s*(дн\p{L}*|день|дня|days?|месяц\p{L}*|months?|год\p{L}*|лет|years?)/giu)){
  const unit=/^(?:месяц|month)/iu.test(m[3])?'month':/^(?:год|лет|year)/iu.test(m[3])?'year':'day';
  const type=m[2]?/^(?:рабоч|business|working)/iu.test(m[2])?'work':/^(?:банковск|banking)/iu.test(m[2])?'bank':'calendar':null;
  out.push({n:Number(m[1]),unit,type,at:m.index,text:m[0]});
 }
 return out;
}

// --- Clauses -----------------------------------------------------------------------------------------------------------
const NUMBERED=/^(\d{1,2}(?:\.\d{1,3}){1,3})\.?\s+(?=[«"(\p{L}])|^(\d{1,2})\.\s+(?=[«"(\p{L}])/u;
const ARTICLE=/^(?:Статья|Раздел|Article|Section)\s+(\d{1,2}(?:\.\d{1,2})?)\.?\s*/iu;
const upper=s=>{const letters=s.replace(/[^\p{L}]/gu,'');return letters.length>=4&&letters===letters.toLocaleUpperCase();};
function clauses(doc){
 const out=[];let cur=null;
 const start=(num,title,heading,page,rest)=>{cur={num,title,heading,page,pages:[page],lines:rest?[{page,text:rest}]:[]};out.push(cur);};
 for(const p of doc.pages)for(const line of p.lines||[]){
  const m=NUMBERED.exec(line),a=ARTICLE.exec(line);
  if(m||a){
   const num=a?a[1]:m[1]||m[2];const rest=line.slice((a||m)[0].length).trim();
   const heading=!num.includes('.')&&(upper(rest)||rest.length<=70&&!/[.;:,]$/.test(rest)&&!/\s(?:и|в|на|с|по|за)$/iu.test(rest));
   start(num,heading?rest:'',heading,p.n,heading?'':rest);
   continue;
  }
  if(upper(line)&&line.length<=90&&!/[.;,]$/.test(line)&&(!cur||cur.heading||cur.lines.length)){start('',line,true,p.n,'');continue;}
  if(!cur)start('0','',false,p.n,'');
  cur.lines.push({page:p.n,text:line});if(!cur.pages.includes(p.n))cur.pages.push(p.n);
 }
 // Titles of sections reach their sub-clauses; texts are joined across lines and pages.
 let section='';
 for(const c of out){if(c.heading)section=c.title;c.section=c.heading?'':section;c.text=joinLines(c.lines.map(l=>l.text));}
 return out.filter(c=>c.heading||c.text);
}

// --- Fields ------------------------------------------------------------------------------------------------------------
const KIND=[
 ['renewal',/пролонг\p{L}*|автоматически\s+продл\p{L}*|считается\s+продл[её]нн\p{L}*|продлевается\s+на|продл[её]н\p{L}*\s+на\s+(?:тот\s+же|такой\s+же|каждый|следующ)|automatically\s+renew|auto-?renew|renew(?:ed|al)?\s+for/iu],
 ['penalty',/неустойк\p{L}*|(?:^|[^\p{L}])пен[иья](?:$|[^\p{L}])|штраф\p{L}*|penalt\p{L}*|liquidated\s+damages|late\s+fee/iu],
 ['ip',/исключительн\p{L}*\s+прав\p{L}*|интеллектуальн\p{L}*\s+собственност\p{L}*|лицензи\p{L}*|авторск\p{L}*\s+прав\p{L}*|intellectual\s+property|licen[cs]e|copyright/iu],
 ['termination',/расторг\p{L}*|отказ\p{L}*\s+от\s+исполнения|прекращ\p{L}*\s+(?:действи\p{L}*\s+)?(?:настоящего\s+)?договор\p{L}*|terminat\p{L}*/iu],
 ['payment',/оплат\p{L}*|оплачива\p{L}*|выплачива\p{L}*|выплат\p{L}*|перечисл\p{L}*|платеж\p{L}*|платёж\p{L}*|аванс\p{L}*|предоплат\p{L}*|(?:^|[^\p{L}])pa(?:y|id|yment|yable)(?:$|[^\p{L}])|invoice/iu],
 ['price',/стоимост\p{L}*|цен[аыу]\s+(?:договора|работ|услуг|лицензии)|сумм[аы]\s+(?:договора|вознаграждения)|вознагражден\p{L}*|contract\s+price|total\s+(?:price|fee|amount)|(?:^|[^\p{L}])fees?(?:$|[^\p{L}])/iu],
 ['term',/вступает\s+в\s+силу|действует\s+(?:до|в\s+течение)|срок\s+действия\s+(?:настоящего\s+)?договора\s+(?:составляет|—|-|до)|срок\s+(?:настоящего\s+)?договора|enters?\s+into\s+force|remains?\s+in\s+(?:force|effect)|term\s+of\s+this\s+agreement|expires?/iu]
];
const LABEL={parties:'Стороны',number:'Номер и дата',price:'Стоимость',payment:'Порядок оплаты',term:'Срок действия',renewal:'Автопродление',termination:'Расторжение',penalty:'Неустойка и штрафы',ip:'Права и лицензии'};
const ORDER=['parties','number','price','payment','term','renewal','termination','penalty','ip'];
const money=(a)=>(a.amount.toLocaleString('ru-RU',{maximumFractionDigits:2})+' '+({RUB:'₽',USD:'$',EUR:'€'}[a.currency]||'')).replace(NBSP,' ').trim();
const ru=d=>{const [y,m,dd]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,dd)).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).replace(NBSP,' ');};
const periodText=p=>p.n+' '+(p.type==='work'?'рабоч. ':p.type==='bank'?'банк. ':p.type==='calendar'?'календ. ':'')+({day:'дн.',month:'мес.',year:'г.'}[p.unit]);
// A short value for a sentence of a kind: every number in it is taken from the sentence itself.
function valueOf(kind,text){
 const am=amounts(text),pc=percents(text),pe=periods(text),dt=dates(text);
 const parts=[];
 if(kind==='price'){if(am.length)parts.push(money(am[0]));if(/НДС\s+не\s+облага|без\s+НДС/iu.test(text))parts.push('без НДС');else if(/(?:в\s+том\s+числе|включая)\s+НДС/iu.test(text))parts.push('с НДС');}
 else if(kind==='payment'){if(/аванс|предоплат|advance|prepay/iu.test(text))parts.push('аванс'+(pc[0]?' '+String(pc[0].value).replace('.',',')+'%':am[0]?' '+money(am[0]):''));else if(am[0])parts.push(money(am[0]));
  if(pe[0])parts.push('в течение '+periodText(pe[0]));if(dt.length)parts.push('не позднее '+ru(dt[dt.length-1].date));if(/ежемесячн|monthly/iu.test(text))parts.push('ежемесячно');}
 else if(kind==='term'){const to=dt.find(d=>/до\s*[«"]?\d|until|till/iu.test(text.slice(Math.max(0,d.at-12),d.at+2)))||dt[dt.length-1];if(to)parts.push('до '+ru(to.date));else if(pe[0])parts.push(periodText(pe[0]));if(/с\s+момента\s+подписания|upon\s+signing/iu.test(text))parts.push('с подписания');}
 else if(kind==='renewal'){parts.push('продлевается автоматически');if(/календарн\p{L}*\s+год|на\s+год|year/iu.test(text))parts.push('на год');else if(/тот\s+же\s+срок|same\s+term/iu.test(text))parts.push('на тот же срок');const n=pe.find(p=>p.unit==='day');if(n)parts.push('отказ — за '+periodText(n));}
 else if(kind==='termination'){if(/одностороннем|unilateral/iu.test(text))parts.push('односторонний отказ');const n=pe.find(p=>p.unit==='day'||p.unit==='month');if(n)parts.push('уведомление за '+periodText(n));if(/суд\p{L}*\s+порядк|court/iu.test(text))parts.push('через суд');}
 else if(kind==='penalty'){if(pc[0])parts.push(String(pc[0].value).replace('.',',')+'%'+(/кажд\p{L}*\s+(?:день|календарный\s+день)|(?:^|\s)(?:в|за)\s+день|per\s+day|for\s+each\s+day/iu.test(text)?' в день':''));else if(am[0])parts.push(money(am[0]));
  const cap=/не\s+более\s+(\d+(?:[,.]\d+)?)\s*%|not\s+(?:to\s+)?exceed\w*\s+(\d+(?:\.\d+)?)\s*%/iu.exec(text);if(cap)parts.push('не более '+(cap[1]||cap[2]).replace('.',',')+'%');}
 else if(kind==='ip'){if(/исключительн\p{L}*\s+прав\p{L}*[^.]{0,80}(?:переход|переда|отчужд|принадлеж)/iu.test(text)||/(?:переход|переда|отчужд)\p{L}*[^.]{0,60}исключительн\p{L}*\s+прав/iu.test(text))parts.push('передача исключительного права');
  if(/неисключительн\p{L}*|прост\p{L}*\s*\(?неисключ/iu.test(text))parts.push('простая лицензия');else if(/исключительн\p{L}*\s+лицензи/iu.test(text))parts.push('исключительная лицензия');else if(/лицензи|licen[cs]e/iu.test(text)&&!parts.length)parts.push('лицензия');
  if(/безвозмездн|royalty-free|free\s+of\s+charge/iu.test(text))parts.push('безвозмездно');}
 return parts.join(' · ');
}
function windowQuote(text,at,max=360){
 if(text.length<=max)return text;
 let s=Math.max(0,at-max/3),e=Math.min(text.length,s+max);
 while(s>0&&!/\s/.test(text[s-1]))s++;while(e<text.length&&!/\s/.test(text[e]))e--;
 return text.slice(s,e).trim();
}
// The page a sentence of a clause starts on: the line that holds its first words.
function pageOf(clause,sentence){
 const head=norm(sentence).slice(0,40);
 let acc='';for(const l of clause.lines){acc+=' '+l.text;if(norm(acc).includes(head))return l.page;}
 return clause.page;
}
const ROLE=/заказчик|исполнитель|подрядчик|поставщик|покупател|продав|лицензиар|лицензиат|сублицензиат|арендатор|арендодател|издател|разработчик|агент|принципал|правообладател|пользовател|клиент|работник|работодател|займодав|заемщик|заёмщик|сторон[аы]|licensor|licensee|client|contractor|customer|supplier|publisher|developer|vendor|buyer|seller|party|employer|employee|company/iu;
const ORG=/^(?:Общество\s+с\s+ограниченной\s+ответственностью|ООО|АО|ПАО|ЗАО|НАО|ИП|Индивидуальный\s+предприниматель|Гражданин\p{L}*|LLC|Ltd\.?|Limited|Inc\.?|GmbH)(?=$|[\s«"“])/u;
function extract(doc,list=clauses(doc)){
 const fields=[];
 // Parties: «… именуемое в дальнейшем «Заказчик»» in the preamble (first clauses / first page).
 const pre=list.filter(c=>c.page<=2).slice(0,4);
 for(const c of pre){
  const t=c.text;let prev=0;
  for(const m of t.matchAll(/,?\s*(?:именуем\p{L}*|далее\s*[-—–]?\s*|hereinafter(?:\s+referred\s+to\s+as)?)\s*(?:в\s+дальнейшем\s+)?(?:the\s+)?[«"“]([^»"”]{2,40})[»"”]/giu)){
   const seg=t.slice(prev,m.index);
   // The party's name starts after «…с одной стороны, и» / «, и» / « и » or at the start of the preamble.
   const b=/(?:с\s+одной\s+стороны,\s*и|,\s+и|\sи|\band)\s+(?=[\p{Lu}«"])/gu;let last=null,x;while((x=b.exec(seg)))last=x;
   let from=prev+(last?last.index+last[0].length:0);
   // …or at the legal form of the last organisation named before the role («…2026 г. Общество с ограниченной…»).
   const forms=[...seg.matchAll(/(?:^|[\s,;.])((?:Общество\s+с\s+ограниченной\s+ответственностью|ООО|АО|ПАО|ЗАО|НАО|ИП|Индивидуальный\s+предприниматель|Гражданин\p{L}*)(?=[\s«"“]))/gu)];
   if(forms.length){const f=forms[forms.length-1];from=Math.max(from,prev+f.index+f[0].indexOf(f[1]));}
   while(from<m.index&&/[\s,;:]/.test(t[from]))from++;
   const name=t.slice(from,m.index).trim(),role=m[1].trim();
   prev=m.index+m[0].length;
   if(name.length<3||name.length>220)continue;
   if(!ROLE.test(role)&&!ORG.test(name))continue;
   const quote=t.slice(from,m.index+m[0].length).trim();
   const org=/(?:Общество\s+с\s+ограниченной\s+ответственностью|ООО|АО|ПАО|ЗАО|НАО|ИП|Индивидуальный\s+предприниматель|LLC|Ltd\.?|Limited|Inc\.?|GmbH)\s*[«"“]?[^»"”,]{0,80}[»"”]?/u.exec(name);
   fields.push({kind:'parties',value:role+' — '+(org?org[0].replace(/Общество\s+с\s+ограниченной\s+ответственностью/u,'ООО').trim():name.split(',')[0].slice(0,80)),quote,page:pageOf(c,quote),clause:c.num});
  }
 }
 // Number and date: the title lines of the first page.
 const first=doc.pages[0]?.lines||[];
 const numLine=first.slice(0,12).find(l=>/(?:договор\p{L}*|контракт\p{L}*|соглашени\p{L}*|agreement|contract)\s*(?:№|N|No\.?|#)\s*\S/iu.test(l));
 const dateLine=first.slice(0,15).find(l=>dates(l).length);
 if(numLine||dateLine){
  const num=numLine?/(?:№|N|No\.?|#)\s*([^\s,]+)/u.exec(numLine)[1]:'';
  const d=dateLine?dates(dateLine)[0]:null;
  fields.push({kind:'number',value:[num?'№ '+num:'',d?'от '+ru(d.date):''].filter(Boolean).join(' '),quote:[numLine,dateLine].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' '),page:1,clause:'',date:d?.date||null,quotes:[numLine,dateLine].filter((v,i,a)=>v&&a.indexOf(v)===i)});
 }
 // Every sentence of every clause: the first kind that fits.
 for(const c of list){
  if(c.heading||!c.text)continue;
  for(const s of sentences(c.text)){
   // A heading left inside a clause («ШТРАФЫ 3.1.») is not a term.
   if(s.text.length<25)continue;
   const hit=KIND.find(([,re])=>re.test(s.text));if(!hit)continue;
   const kind=hit[0];
   if(kind==='payment'&&!(periods(s.text).length||dates(s.text).length||/аванс|предоплат|ежемесячн|advance|monthly/iu.test(s.text)||amounts(s.text).length))continue;
   if(kind==='price'&&!amounts(s.text).length)continue;
   if(kind==='term'&&!(dates(s.text).length||periods(s.text).some(p=>p.unit!=='day')||/с\s+момента\s+подписания/iu.test(s.text)))continue;
   if(fields.filter(f=>f.kind===kind).length>=4)continue;
   const quote=windowQuote(s.text,0);
   fields.push({kind,value:valueOf(kind,s.text),quote,page:pageOf(c,s.text),clause:c.num});
  }
 }
 return fields.map(f=>({...f,label:LABEL[f.kind],by:f.by||'code'}));
}

// --- Verification ------------------------------------------------------------------------------------------------------
// A quote counts only if it is in the contract: on its page, or (moved) on another page, or across a page break.
function verify(doc,quote,page){
 const q=norm(quote);if(q.length<8)return {ok:false};
 const text=p=>norm(doc.pages.find(x=>x.n===p)?.lines?.join('\n')||'');
 if(page&&text(page).includes(q))return {ok:true,page};
 for(const p of doc.pages){if(text(p.n).includes(q))return {ok:true,page:p.n,moved:page&&page!==p.n};}
 for(let i=0;i+1<doc.pages.length;i++){const two=norm(doc.pages[i].lines.join('\n')+'\n'+doc.pages[i+1].lines.join('\n'));if(two.includes(q))return {ok:true,page:doc.pages[i].n,moved:page&&page!==doc.pages[i].n};}
 return {ok:false};
}
function checkAll(doc,fields){
 const kept=[],dropped=[];
 for(const f of fields){
  const quotes=f.quotes||[f.quote];
  const results=quotes.map(q=>verify(doc,q,f.page));
  if(results.every(r=>r.ok))kept.push({...f,page:results[0].page,verified:true});else dropped.push(f);
 }
 return {fields:kept,dropped};
}

// --- Deadlines ---------------------------------------------------------------------------------------------------------
const addDays=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function addWork(d,n){let t=d,k=0;while(k<n){t=addDays(t,1);const w=new Date(t+'T00:00:00Z').getUTCDay();if(w!==0&&w!==6)k++;}return t;}
function addPeriod(d,p){if(p.unit==='month'){const [y,m,dd]=d.split('-').map(Number);const x=new Date(Date.UTC(y,m-1+p.n,dd));return x.toISOString().slice(0,10);}if(p.unit==='year'){const [y,m,dd]=d.split('-').map(Number);return iso(y+p.n,m,dd)||addDays(d,365*p.n);}return p.type==='work'||p.type==='bank'?addWork(d,p.n):addDays(d,p.n);}
function deadlines(fields){
 const out=[];
 const signed=fields.find(f=>f.kind==='number')?.date||null;
 const term=fields.find(f=>f.kind==='term');
 let end=null;
 if(term){const d=dates(term.quote);const to=d.find(x=>/до\s*[«"]?\d|until|till/iu.test(term.quote.slice(Math.max(0,x.at-12),x.at+2)))||d[d.length-1];
  if(to)end=to.date;else if(signed){const p=periods(term.quote).find(x=>x.unit!=='day');if(p)end=addPeriod(signed,p);}
  if(end)out.push({date:end,label:'Окончание срока договора',kind:'term',quote:term.quote,page:term.page,approx:!to});}
 const renewal=fields.find(f=>f.kind==='renewal');
 if(renewal&&end){const n=periods(renewal.quote).find(p=>p.unit==='day');if(n)out.push({date:addPeriod(end,{...n,n:-n.n,type:n.type==='work'?'calendar':n.type}),label:'Последний день, чтобы отказаться от продления',kind:'renewal',quote:renewal.quote,page:renewal.page,approx:n.type==='work'||n.type==='bank'});}
 for(const f of fields.filter(x=>x.kind==='payment')){
  for(const d of dates(f.quote))out.push({date:d.date,label:'Срок оплаты',kind:'payment',quote:f.quote,page:f.page});
  // «в течение 10 рабочих дней с даты подписания договора»: from the signing date in the title.
  const p=periods(f.quote)[0];
  if(p&&signed&&/с\s+(?:даты|момента)\s+(?:подписания|заключения)|from\s+the\s+(?:date\s+of\s+)?(?:signing|execution)/iu.test(f.quote))out.push({date:addPeriod(signed,p),label:'Срок оплаты'+(/аванс|предоплат/iu.test(f.quote)?' аванса':''),kind:'payment',quote:f.quote,page:f.page,approx:p.type==='work'||p.type==='bank'});
 }
 const seen=new Set();
 return out.filter(d=>{const k=d.date+d.label;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.date.localeCompare(b.date));
}

// --- Versions ----------------------------------------------------------------------------------------------------------
const words=s=>new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3));
function similarity(a,b){const A=words(a),B=words(b);if(!A.size&&!B.size)return 1;let n=0;for(const w of A)if(B.has(w))n++;return n/(A.size+B.size-n||1);}
const tokens=s=>String(s||'').split(/\s+/).filter(Boolean);
// Word-level diff (LCS over words compared as normalised text); long texts fall back to trimming the common prefix
// and suffix. Ops are phrases without outer spaces: {t:'='|'-'|'+', s}; consecutive changes become one «old → new».
function wordDiff(left,right){
 const A=tokens(left),B=tokens(right),key=t=>norm(t)||t;
 let pre=0;while(pre<A.length&&pre<B.length&&key(A[pre])===key(B[pre]))pre++;
 let suf=0;while(suf<A.length-pre&&suf<B.length-pre&&key(A[A.length-1-suf])===key(B[B.length-1-suf]))suf++;
 const a=A.slice(pre,A.length-suf),b=B.slice(pre,B.length-suf);
 const seq=B.slice(0,pre).map(w=>['=',w]);
 if(a.length*b.length>400000){seq.push(...a.map(w=>['-',w]),...b.map(w=>['+',w]));}
 else{
  const n=a.length,m=b.length,L=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=key(a[i])===key(b[j])?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  let i=0,j=0;
  while(i<n&&j<m){if(key(a[i])===key(b[j])){seq.push(['=',b[j]]);i++;j++;}else if(L[i+1][j]>=L[i][j+1])seq.push(['-',a[i++]]);else seq.push(['+',b[j++]]);}
  while(i<n)seq.push(['-',a[i++]]);while(j<m)seq.push(['+',b[j++]]);
 }
 seq.push(...B.slice(B.length-suf).map(w=>['=',w]));
 const out=[];
 for(let k=0;k<seq.length;){
  if(seq[k][0]==='='){const words=[];while(k<seq.length&&seq[k][0]==='=')words.push(seq[k++][1]);out.push({t:'=',s:words.join(' ')});continue;}
  const del=[],ins=[];while(k<seq.length&&seq[k][0]!=='='){(seq[k][0]==='-'?del:ins).push(seq[k][1]);k++;}
  if(del.length)out.push({t:'-',s:del.join(' ')});if(ins.length)out.push({t:'+',s:ins.join(' ')});
 }
 return out;
}
function compare(oldDoc,newDoc){
 const A=clauses(oldDoc),B=clauses(newDoc);
 const pairs=[],usedA=new Set(),usedB=new Set();
 // Same number and similar text, then the best similar text (renumbered or moved).
 B.forEach((b,j)=>{if(!b.num)return;const i=A.findIndex((a,k)=>!usedA.has(k)&&a.num===b.num&&a.heading===b.heading&&similarity(a.text||a.title,b.text||b.title)>=0.3);if(i>=0){usedA.add(i);usedB.add(j);pairs.push([i,j]);}});
 B.forEach((b,j)=>{if(usedB.has(j))return;let best=-1,score=0.5;A.forEach((a,i)=>{if(usedA.has(i)||a.heading!==b.heading)return;const sc=similarity(a.text||a.title,b.text||b.title);if(sc>=score){score=sc;best=i;}});if(best>=0){usedA.add(best);usedB.add(j);pairs.push([best,j]);}});
 const rows=[];
 const brief=c=>({num:c.num,title:c.title||c.section||'',heading:c.heading,page:c.page,text:c.heading?c.title:c.text});
 for(const [i,j] of pairs){
  const a=A[i],b=B[j],ta=a.heading?a.title:a.text,tb=b.heading?b.title:b.text;
  const same=norm(ta)===norm(tb);
  rows.push({status:same?(a.num!==b.num?'moved':'same'):'changed',old:brief(a),new:brief(b),order:j,ops:same?null:wordDiff(ta,tb)});
 }
 A.forEach((a,i)=>{if(!usedA.has(i)){const after=pairs.filter(([x])=>x<i).map(([,y])=>y);rows.push({status:'removed',old:brief(a),new:null,order:(after.length?Math.max(...after):-1)+0.5});}});
 B.forEach((b,j)=>{if(!usedB.has(j))rows.push({status:'added',old:null,new:brief(b),order:j});});
 rows.sort((x,y)=>x.order-y.order);
 const counts={same:0,changed:0,moved:0,added:0,removed:0};for(const r of rows)counts[r.status]++;
 // What the changed clauses do to the extracted terms.
 const fa=extract(oldDoc,A),fb=extract(newDoc,B);
 const by=(list,k)=>list.filter(f=>f.kind===k).map(f=>f.value).filter(Boolean).join('; ');
 const fieldChanges=ORDER.map(k=>({kind:k,label:LABEL[k],old:by(fa,k),new:by(fb,k)})).filter(x=>x.old!==x.new&&(x.old||x.new));
 return {rows:rows.map(({order,...r})=>r),counts,fieldChanges};
}
module.exports={norm,joinLines,sentences,dates,amounts,percents,periods,clauses,extract,verify,checkAll,deadlines,wordDiff,compare,similarity,valueOf,LABEL,ORDER,KINDS:KIND.map(k=>k[0])};
