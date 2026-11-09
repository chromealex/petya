// «Архитектурные решения», the files (no I/O here except reading the folder): ADRs live in the project's
// `docs/adr/NNNN-slug.md`. Parsing reads Russian and English headings (Nygard / MADR: «Контекст», «Context and
// Problem Statement», «Решение», «Decision Outcome», «Альтернативы», «Considered Options», «Последствия»,
// «Consequences»), the status and the date. Search is by word stems over title, decision and the rest.
const fs=require('node:fs'),path=require('node:path');
const DIR=path.join('docs','adr');
const FILE=/^(\d{1,5})-[a-z0-9][a-z0-9-]{0,80}\.md$/i;
const MAX_FILES=500,MAX_BYTES=200000;

const SECTIONS={
 context:/^(?:контекст|context|контекст и проблема|context and problem statement|проблема|problem|предыстория|background)/i,
 decision:/^(?:решение|decision|decision outcome|итоговое решение|принятое решение)/i,
 alternatives:/^(?:альтернатив\p{L}*|рассмотренные варианты|варианты|considered options|options|alternatives)/iu,
 consequences:/^(?:последстви\p{L}*|consequences|positive consequences|negative consequences)/iu,
 status:/^(?:статус|status)$/i
};
const STATUS=[['superseded',/заменен|заменён|superseded|устарел|deprecated/i],['rejected',/отклонен|отклонён|rejected/i],['proposed',/предложен|proposed|черновик|draft|на обсуждении/i],['accepted',/принят|accepted|действует/i]];
const statusOf=t=>{for(const [k,re] of STATUS)if(re.test(String(t||'')))return k;return t?'other':'';};

function parse(text,file=''){
 const src=String(text||'').replace(/\r\n?/g,'\n');
 const lines=src.split('\n');
 const h1=lines.find(l=>/^#\s+\S/.test(l))||'';
 const number=Number(FILE.exec(path.basename(file))?.[1]||/^#\s*(?:ADR[-\s]?)?(\d{1,5})[.:\s]/i.exec(h1)?.[1]||0);
 const title=h1.replace(/^#\s+/,'').replace(/^(?:ADR[-\s]?)?\d{1,5}\s*[.:—-]?\s*/i,'').trim()||path.basename(file,'.md');
 const out={number,title,file,status:'',statusText:'',date:'',sections:{},text:src};
 let current='',buf=[];
 const flush=()=>{if(current){const body=buf.join('\n').trim();out.sections[current]=(out.sections[current]?out.sections[current]+'\n\n':'')+body;}buf=[];};
 for(const line of lines){
  const h=/^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
  if(h){flush();current=Object.keys(SECTIONS).find(k=>SECTIONS[k].test(h[1].trim()))||'other';continue;}
  const meta=/^\s*(?:[-*]\s*)?(?:\*\*)?(статус|status|дата|date)(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(line);
  if(meta&&!current){if(/^(?:статус|status)$/i.test(meta[1]))out.statusText=meta[2];else out.date=meta[2];continue;}
  buf.push(line);
 }
 flush();
 if(!out.statusText&&out.sections.status)out.statusText=out.sections.status.split('\n')[0].trim();
 out.status=statusOf(out.statusText);
 out.date=(/\d{4}-\d{2}-\d{2}/.exec(out.date)||[''])[0];
 return out;
}

// Every ADR of a folder (newest number last). Unreadable or huge files are skipped.
function list(folder){
 const dir=path.join(folder,DIR);
 let names=[];try{names=fs.readdirSync(dir).filter(n=>FILE.test(n)).slice(0,MAX_FILES);}catch{return [];}
 const rows=[];
 for(const name of names){
  try{const full=path.join(dir,name);const st=fs.statSync(full);if(!st.isFile()||st.size>MAX_BYTES)continue;
   const r=parse(fs.readFileSync(full,'utf8'),name);r.path=path.join(DIR,name).split(path.sep).join('/');r.mtime=st.mtime.toISOString();if(!r.date)r.date=r.mtime.slice(0,10);rows.push(r);}catch{}
 }
 return rows.sort((a,b)=>a.number-b.number||a.file.localeCompare(b.file));
}
const nextNumber=rows=>rows.reduce((n,r)=>Math.max(n,r.number||0),0)+1;
const pad=n=>String(n).padStart(4,'0');

// Russian (and English) to a file-name slug: «Переход на Addressables» → «perehod-na-addressables».
const TR={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
function slug(title){
 let s=String(title||'').toLowerCase().split('').map(c=>TR[c]??c).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 // Long titles are cut at a word boundary.
 if(s.length>60)s=s.slice(0,60).replace(/-[^-]*$/,'')||s.slice(0,60);
 return s||'reshenie';
}

// --- Words ------------------------------------------------------------------------------------------------------
// Words that never decide a match (one '|'-joined literal: a pattern, not interface text).
const STOP=new Set('про|для|как|что|это|или|при|над|под|без|его|они|мы|наш|наши|нашем|нашей|какие|какое|решение|решения|решений|решили|принимали|приняли|был|были|будем|чтобы|если|так|там|тут|the|and|for|with|насчет|насчёт|касательно|поводу|переход|перейти|использовать|используем'.split('|'));
const words=text=>[...new Set((String(text||'').toLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!STOP.has(w)))];
// A short stem: the word without its ending (at least three letters).
const stem=w=>w.length<=4?w.slice(0,3):w.slice(0,Math.max(4,w.length-2));
const hits=(stems,text)=>{const t=words(text);return stems.filter(s=>t.some(w=>w.startsWith(s)||s.startsWith(w)&&w.length>=4)).length;};

// Ranks ADRs for a query: title 3, decision 2, the rest 1 per matched stem; ties by number (newest first).
function search(rows,query,{limit=8}={}){
 const stems=words(query).map(stem);
 if(!stems.length)return [];
 return rows.map(r=>{
  const score=3*hits(stems,r.title)+2*hits(stems,r.sections.decision)+hits(stems,[r.sections.context,r.sections.alternatives,r.sections.consequences,r.sections.other].join('\n'));
  return {r,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.r.number-a.r.number).slice(0,limit).map(x=>({...x.r,score:x.score,excerpt:excerpt(x.r,stems)}));
}
// The sentence of the ADR that best shows the match (decision first).
function excerpt(r,stems){
 for(const part of [r.sections.decision,r.sections.context,r.sections.consequences,r.sections.alternatives,r.sections.other,r.text]){
  const sentences=String(part||'').replace(/\s+/g,' ').split(/(?<=[.!?])\s+/);
  const best=sentences.find(s=>hits(stems,s)>0);
  if(best)return best.trim().slice(0,300);
 }
 return String(r.sections.decision||'').replace(/\s+/g,' ').trim().slice(0,300);
}

// The ADR as Markdown, exactly as it will be saved.
function format({number,title,date,status='Принято',context,decision,alternatives=[],consequences=[],sources=[]}){
 const list=rows=>rows.length?rows.map(r=>'- '+r).join('\n'):'- —';
 return ['# '+number+'. '+title,'','- Дата: '+date,'- Статус: '+status,'','## Контекст','',context||'—','','## Решение','',decision,'','## Альтернативы','',list(alternatives),'','## Последствия','',list(consequences),
  ...(sources.length?['','## Источники','',list(sources)]:[]),''].join('\n');
}

// A quote counts only when it is literally in the text (whitespace and case of «ё» normalized), ≥ 8 characters.
function verbatim(quote,text){
 const norm=t=>String(t||'').replace(/[*_`>#]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const q=norm(String(quote||'').replace(/^[\s«"'“„]+|[\s»"'”.]+$/gu,''));
 return q.length>=8&&norm(text).toLowerCase().includes(q.toLowerCase())?q:'';
}

module.exports={DIR,FILE,parse,list,nextNumber,pad,slug,words,stem,search,excerpt,format,verbatim,statusOf};
