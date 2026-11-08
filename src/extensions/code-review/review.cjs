// The model's part of «Код-ревью»: each file's changed hunks go to the local model with a strict JSON schema;
// code keeps only comments that point to an added line which exists and whose quoted code is really on that line
// (a nearby line with the quote is accepted and the line number corrected). Everything else is dropped and counted.
const kit=require('../app-kit.cjs');
const diff=require('./diff.cjs');
const checks=require('./checks.cjs');
const SEVERITIES=['blocker','warning','nit'],CATEGORIES=['bug','security','perf','style','test'];
const CHUNK=220,MAX_CALLS=24,PER_FILE=8;

const SCHEMA={type:'object',additionalProperties:false,required:['comments'],properties:{comments:{type:'array',maxItems:PER_FILE,items:{type:'object',additionalProperties:false,
 required:['line','quote','severity','category','comment'],properties:{line:{type:'integer'},quote:{type:'string'},severity:{type:'string',enum:SEVERITIES},category:{type:'string',enum:CATEGORIES},comment:{type:'string'},suggestion:{type:'string'}}}}}};
const SYSTEM='Ты внимательный ревьюер кода. Тебе дан дифф одного файла: у строк с «+» слева номер строки в новой версии файла, «-» — удалённые строки, без знака — контекст. '+
 'Найди настоящие проблемы только в добавленных строках («+»): ошибки, уязвимости, лишнюю работу, неясный код, недостающие проверки. '+
 'line — номер добавленной строки; quote — точный фрагмент кода из этой строки (не меньше 4 символов, без номера и знака); '+
 'severity: blocker — сломает работу или безопасность, warning — вероятная проблема, nit — мелочь стиля; category: bug, security, perf, style или test. '+
 'comment — по-русски, одна-две конкретные фразы: что не так и почему. suggestion — исправленный код для этой строки (только код), если исправление очевидно. '+
 'Не повторяй одно замечание, не хвали, не выдумывай. Если проблем нет — пустой список.';

// The file's hunks as the model sees them, split into chunks of at most CHUNK changed lines.
function chunks(file){
 const out=[];let lines=[],changed=0;
 const push=()=>{if(changed)out.push(lines.join('\n'));lines=[];changed=0;};
 for(const h of file.hunks){
  if(changed>=CHUNK)push();
  lines.push('@@');
  for(const l of h.lines){
   if(l.kind==='add')lines.push(String(l.n).padStart(5)+' + '+l.text.slice(0,300));
   else if(l.kind==='del')lines.push('      - '+l.text.slice(0,300));
   else lines.push(String(l.n).padStart(5)+'   '+l.text.slice(0,300));
   if(l.kind!=='ctx'&&++changed>=CHUNK*1.5)push();
  }
 }
 push();
 return out;
}
const squash=t=>String(t||'').replace(/\s+/g,' ').trim();
// A model comment → a verified comment, or null when it does not point to an added line with the quoted code.
function verify(file,raw,added=diff.addedLines(file)){
 if(!raw||!SEVERITIES.includes(raw.severity)||!CATEGORIES.includes(raw.category))return null;
 const text=squash(raw.comment).slice(0,500);if(text.length<6)return null;
 const quote=squash(raw.quote).replace(/^\d+\s*[+ ]\s+/,'');if(quote.length<4)return null;
 const line=Number(raw.line);if(!Number.isInteger(line))return null;
 const has=n=>added.has(n)&&squash(added.get(n)).includes(quote);
 let at=has(line)?line:0;
 for(let d=1;!at&&d<=3;d++){if(has(line-d))at=line-d;else if(has(line+d))at=line+d;}
 if(!at)return null;
 let suggestion=String(raw.suggestion||'').replace(/^```\w*\n?|\n?```$/g,'').replace(/\s+$/,'').slice(0,1000);
 if(squash(suggestion)===squash(added.get(at))||!squash(suggestion))suggestion='';
 return {file:file.path,line:at,severity:raw.severity,category:raw.category,comment:text,quote,...suggestion?{suggestion}:{},by:'model'};
}

async function modelReview(s,files,{progress=()=>{}}={}){
 const comments=[];let dropped=0,calls=0,failed=0,cut=false;
 for(const file of files){
  const added=diff.addedLines(file);if(!added.size)continue;
  for(const text of chunks(file)){
   if(calls>=MAX_CALLS){cut=true;break;}
   calls++;progress(file.path);
   let r=null;
   try{r=await kit.modelJSON(s,{system:SYSTEM,user:'Файл: '+file.path+'\n'+text,schema:SCHEMA,predict:1400,temperature:0.1});}
   catch(e){if(/Модель изменилась/.test(e.message))throw e;failed++;continue;}
   if(!r){failed++;continue;}
   for(const raw of (Array.isArray(r.comments)?r.comments:[]).slice(0,PER_FILE)){const c=verify(file,raw,added);if(c)comments.push(c);else dropped++;}
  }
 }
 return {comments,dropped,calls,failed,cut};
}

const RANK={blocker:0,warning:1,nit:2};
// Code checks + verified model comments → the card's comments with excerpts; one comment per line and category.
function assemble({files,skipped},found,model){
 const byPath=new Map(files.map(f=>[f.path,f]));
 const seen=new Set(),list=[];
 for(const c of [...found,...(model?.comments||[])]){
  const key=c.file+':'+(c.line??'file')+':'+c.category;
  if(seen.has(key))continue;seen.add(key);
  const file=byPath.get(c.file);
  const excerpt=c.line&&file?diff.around(file,c.line).map(l=>({...l,text:checks.mask(l.text)})):[];
  list.push({...c,comment:checks.mask(c.comment),...c.suggestion?{suggestion:checks.mask(c.suggestion)}:{},excerpt,lang:language(c.file)});
 }
 list.sort((a,b)=>RANK[a.severity]-RANK[b.severity]||a.file.localeCompare(b.file)||(a.line||0)-(b.line||0));
 list.forEach((c,i)=>{c.id='c'+(i+1);delete c.quote;});
 const counts=sev=>list.filter(c=>c.severity===sev).length;
 const fileRows=[...files.map(f=>({path:f.path,status:f.status,additions:f.additions,deletions:f.deletions,truncated:!!f.truncated})),...skipped.map(f=>({path:f.path,status:'skipped',reason:f.reason,label:f.label,additions:f.additions||0,deletions:f.deletions||0}))]
  .map(f=>({...f,counts:Object.fromEntries(SEVERITIES.map(sev=>[sev,list.filter(c=>c.file===f.path&&c.severity===sev).length]))}));
 fileRows.sort((a,b)=>(a.status==='skipped')-(b.status==='skipped')||(b.counts.blocker-a.counts.blocker)||(b.counts.warning-a.counts.warning)||a.path.localeCompare(b.path));
 return {comments:list,files:fileRows,totals:{blocker:counts('blocker'),warning:counts('warning'),nit:counts('nit'),files:files.length,skipped:skipped.length,
  additions:files.reduce((a,f)=>a+f.additions,0)+skipped.reduce((a,f)=>a+(f.additions||0),0),deletions:files.reduce((a,f)=>a+f.deletions,0)+skipped.reduce((a,f)=>a+(f.deletions||0),0)}};
}
const LANGS=[[/\.(?:[cm]?[jt]sx?|vue|svelte)$/i,'js'],[/\.py$/i,'py'],[/\.(?:cs|java|kt|kts|swift|scala|dart|go|rs|c|cc|cpp|h|hpp|m|mm|php)$/i,'c'],[/\.rb$/i,'rb'],[/\.(?:sh|bash|zsh|ya?ml|toml|ini|cfg|env)$/i,'sh'],[/\.(?:lua|sql)$/i,'sql'],[/\.json$/i,'json']];
function language(file){for(const [re,lang] of LANGS)if(re.test(file))return lang;return 'text';}

module.exports={SCHEMA,SYSTEM,chunks,verify,modelReview,assemble,language,SEVERITIES,CATEGORIES};
