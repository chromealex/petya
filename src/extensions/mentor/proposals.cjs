// What «Петя-наставник» proposes for each pattern, and the drafts shown before «Создать»:
//  · app       — an app from the catalog already does it (found through the extensions' own offers);
//  · schedule  — a recurring command (the existing «Повторяющиеся команды»), when it happens at a regular time;
//  · skill     — a SKILL.md draft installed with the existing skill tools (instructions or a text template);
//  · extension — an idea for a new extension with a draft extension.json.
const history=require('./history.cjs');

function sentence(text){const t=String(text||'').trim();return t?t[0].toLocaleUpperCase('ru')+t.slice(1):'';}
// «Покажи PR, которые ждут ревью каждый день в 09:30» — understood by src/features/recurring.cjs.
function schedulePhrase(command,rhythm){return sentence(command).replace(/[.!?\s]+$/u,'')+(rhythm.every==='weekly'?' каждую неделю':' каждый день в '+rhythm.time);}
const quote=t=>'«'+String(t).replace(/\s+/g,' ').trim().slice(0,160)+'»';
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
const times=n=>n+' '+plural(n,['раз','раза','раз']);
// Cut at a word boundary.
const cut=(text,max)=>{const t=String(text).replace(/\s+/g,' ').trim();if(t.length<=max)return t;const part=t.slice(0,max);return part.slice(0,Math.max(part.lastIndexOf(' '),max*0.6|0)).replace(/[\s,.:;—-]+$/,'')+'…';};
const nameOf=text=>history.slug(history.words(text).filter(w=>!history.STOP.has(w)).slice(0,4).join(' '),40);
const dateRu=iso=>{const d=new Date(iso);return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');};

function skillDraft(p){
 const base=p.kind==='paste'?p.title:p.kind==='sequence'?p.steps.map(s=>s.app).join(' '):p.title;
 const name=(nameOf(base)||'routine').replace(/^(?=\d)/,'s-');
 let description,body;
 if(p.kind==='paste'){
  description='Когда я прошу подготовить текст по шаблону «'+cut(p.title,80)+'»: взять шаблон ниже и подставить новые данные.';
  body='# Шаблон: '+cut(p.title,80)+'\n\nЯ вставлял этот текст '+times(p.count)+' (последние: '+p.examples.slice(0,3).map(e=>dateRu(e.at)).join(', ')+').\n\n## Шаблон\n\n```text\n'+p.template+'\n```\n\n## Как применять\n\n1. Спроси только то, что меняется (места `{…}`), если этого нет в просьбе.\n2. Остальной текст оставь как есть, сохрани порядок и форматирование.\n3. Покажи готовый текст целиком, без пояснений.\n';
 }else if(p.kind==='sequence'){
  description='Когда я прошу «'+p.steps.map(s=>s.app).join(', ')+'» вместе или «мой обычный обход»: выполнить шаги по порядку и свести ответы в один.';
  body='# Обход: '+p.steps.map(s=>s.app).join(' → ')+'\n\nЯ делал эту цепочку '+times(p.count)+', обычно около '+p.time+'.\n\n## Шаги\n\n'+p.steps.map((s,i)=>(i+1)+'. '+s.app+': '+quote(s.ask)).join('\n')+'\n\n## Ответ\n\nОдин ответ: по разделу на шаг, сначала то, что требует внимания.\n';
 }else{
  description='Когда я прошу '+quote(p.title)+' или похожее: ответить так же, как в прошлые разы, без уточняющих вопросов.';
  const seen=new Map();for(const e of p.examples){const k=e.text.trim();seen.set(k,[...(seen.get(k)||[]),dateRu(e.at)]);}
  body='# '+cut(sentence(p.title),80)+'\n\nЯ просил об этом '+times(p.count)+'. Примеры:\n\n'+[...seen].map(([text,dates])=>'- '+quote(text)+' ('+dates.join(', ')+')').join('\n')+'\n\n## Как отвечать\n\n1. '+(p.by?'Используй «'+p.by+'», как в прошлые разы.':'Отвечай по тем же данным, что и в прошлые разы.')+'\n2. Сначала главное, коротко; детали — списком.\n3. Если чего-то не хватает, скажи, чего именно, а не задавай общих вопросов.\n';
 }
 const md='---\nname: '+name+'\ndescription: '+JSON.stringify(description)+'\n---\n\n'+body;
 return {name,description,skillMd:md};
}
const CATEGORY=[[/pr|ревью|код|git|гит|ветк|сборк|билд|ci|деплой|тест/iu,'dev'],[/задач|jira|джир|спринт|команд/iu,'team'],[/встреч|созвон|календар/iu,'meetings'],[/метрик|dau|выручк|retention|ретеншн/iu,'analytics'],[/слак|slack|почт|письм|телеграм/iu,'comms'],[/файл|папк|диск/iu,'computer']];
function extensionDraft(p){
 const words=history.words(p.title).filter(w=>!history.STOP.has(w)).slice(0,3);
 const id=('my-'+history.slug(words.join(' '),30)).replace(/-+$/,'')||'my-routine';
 const category=(CATEGORY.find(([re])=>re.test(p.title))||[0,'personal'])[1];
 const name=sentence(words.join(' ')).slice(0,40)||'Моя рутина';
 const manifest={id,name,description:'Делает то, о чём я прошу руками: '+quote(p.title),category,examples:p.examples.slice(0,3).map(e=>sentence(e.text).slice(0,100)),
  setting:'extension_'+id,settings:false,feature:'feature.cjs',scripts:[],results:{}};
 return {manifest,json:JSON.stringify(manifest,null,2)};
}

// The proposal for one pattern. `appFor(text)` → {id,name,pitch} of a catalog app that is not added yet, or null.
function propose(p,{appFor=()=>null}={}){
 if(p.kind==='request'||p.kind==='search'){
  const app=appFor(p.kind==='search'?p.query:p.title);
  if(app)return {type:'app',app,example:p.kind==='search'?p.query:p.title};
 }
 if((p.kind==='request'||p.kind==='search'||p.kind==='sequence')&&p.regular&&p.every){
  const command=p.kind==='sequence'?p.steps.map(s=>s.ask.replace(/[.!?\s]+$/u,'')).join(', затем '):p.kind==='search'?p.query:p.title;
  return {type:'schedule',command:sentence(command),phrase:schedulePhrase(command,p),when:p.every==='weekly'?'каждую неделю':'каждый день в '+p.time};
 }
 if(p.kind==='paste'||p.kind==='sequence'||p.length>=60||!p.by)return {type:'skill',...skillDraft(p)};
 return {type:'extension',...extensionDraft(p)};
}

// Patterns → ranked proposals: already automated, hidden or created ones are left out; a request that is only a
// step of a found chain is the chain.
function rank(found,{appFor,known=()=>false,hidden=new Set(),created=new Set(),limit=8}={}){
 const chains=found.filter(p=>p.kind==='sequence');
 const rows=[];
 for(const p of found){
  if(hidden.has(p.key)||created.has(p.key))continue;
  if(p.kind!=='sequence'&&p.kind!=='paste'&&known(p.kind==='search'?p.query:p.title))continue;
  // A chain with a step that already runs by itself is not done by hand any more.
  if(p.kind==='sequence'&&p.steps.some(step=>known(step.ask)))continue;
  if(p.kind==='request'&&p.by&&chains.some(c=>c.steps.some(s=>s.app===p.by)&&p.count<=c.count*1.5))continue;
  const proposal=propose(p,{appFor});
  const time=history.estimate(p,proposal.type);
  if(time.savedWeek<=0)continue;
  const {stems,...rest}=p;
  rows.push({...rest,proposal,...time});
 }
 return rows.sort((a,b)=>b.savedWeek-a.savedWeek||b.count-a.count).slice(0,limit);
}
module.exports={propose,rank,skillDraft,extensionDraft,schedulePhrase};
