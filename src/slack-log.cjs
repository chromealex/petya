const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const exec=promisify(execFile);
function isLogQuestion(text){return /(?:билд|сборк|build|pipeline|пайплайн)/iu.test(text)&&/(?:пада|упал|упала|слом|ошиб|fail|error|почему|лог)/iu.test(text)||/(?:почему|разбери|объясни|найди).*(?:^|[\s«"\n])(?:лог[еуах]?|stacktrace)(?=$|[\s.,!?»"])/iu.test(text);}
const logPattern=/(?:error[:\s]|fatal[:\s]|exception|BUILD FAILED|FAILURE:|Caused by:|exit(?:ed)? (?:code|with)|ошибка:|cannot find module|compilation failed)/iu;
function threadURL(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='app.slack.com'||/^[\w-]+\.slack\.com$/.test(u.hostname))&&/^\/archives\/[CDG][A-Z0-9]+\/p\d{16}/.test(u.pathname)?u.href:'';}catch{return '';}}
async function readDesktop({window=false}={}){const unpack=s=>s.replace(/app\.asar([/\\])/u,'app.asar.unpacked$1');let result;if(process.platform==='darwin')result=await exec(unpack(path.join(__dirname,'../assets/native/slack-view')),window?['--window']:[],{timeout:window?15000:6000,maxBuffer:256000});else if(process.platform==='win32')result=await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',unpack(path.join(__dirname,'slack-view.ps1')),...(window?['-Window']:[])],{timeout:7000,maxBuffer:256000,windowsHide:true});else return {error:'Чтение Slack поддерживается на macOS и Windows.'};return JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());}
function excerpt(text,max=40000){if(text.length<=max)return text;const lines=text.split('\n');const indexes=lines.flatMap((line,i)=>logPattern.test(line)?[i]:[]);const keep=new Set();for(const i of indexes.slice(0,40))for(let j=Math.max(0,i-8);j<=Math.min(lines.length-1,i+20);j++)keep.add(j);return ('[Лог сокращён: фрагменты вокруг ошибок]\n'+[...keep].sort((a,b)=>a-b).map(i=>`[строка ${i+1}] ${lines[i]}`).join('\n')).slice(0,max);}
async function downloadLog(file,token,fetcher=fetch){
 if(file.is_external||file.mode==='external'||file.filetype==='remote')throw Error('Внешний файл не загружается автоматически.');
 const url=new URL(file.url_private_download||file.url_private||'');if(url.protocol!=='https:'||url.hostname!=='files.slack.com'||url.username||url.password||url.port)throw Error('Файл находится вне защищённого хранилища Slack.');
 if(!/\.(?:log|txt|out|json|xml|yaml|yml|csv)$/iu.test(file.name||''))throw Error('Для разбора нужен текстовый лог (.log или .txt).');
 const max=2*1024*1024;if(file.size>max)throw Error('Лог больше 2 МБ. Прикрепите нужный фрагмент.');
 const response=await fetcher(url.href,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Не удалось скачать лог из Slack: HTTP '+response.status+'. Проверьте доступ files:read.');
 if(/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Slack вернул страницу входа вместо лога.');
 const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>max)throw Error('Лог больше 2 МБ. Прикрепите нужный фрагмент.');chunks.push(Buffer.from(part));}const text=Buffer.concat(chunks).toString('utf8');if(text.includes('\0'))throw Error('Вложение не является текстовым логом.');return excerpt(text);
}
class SlackLogs{
 constructor({store,request,settings,token,read=readDesktop,now=Date.now}){Object.assign(this,{store,request,settings,token,read,now});this.busy=false;this.status='';this.epoch=0;this.dedupe();}
 // Copies of one open discussion saved by older versions (one per change of the visible text): the newest stays.
 dedupe(){try{const seen=new Set(),drop=[];for(const x of [...this.store.items].filter(x=>x.opened&&x.source==='Slack').sort((a,b)=>b.at-a.at)){const k=x.title+'\n'+(x.url||'');if(seen.has(k))drop.push(x.id);else seen.add(k);}if(drop.length)this.store.remove(drop);}catch{/* the store may be read-only in tests */}}
 reset(){this.epoch++;this.status='';}
 observe(){if(this.observation)return this.observation;this.observation=this.readView().finally(()=>{this.observation=null;});return this.observation;}
 async readView(){if(this.busy)return;this.busy=true;const epoch=this.epoch;try{const view=await this.read();if(epoch!==this.epoch)return;this.status=view.error||'';if(!view.text||!view.thread)return;const text=String(view.text).slice(0,50000),urls=[...new Set((view.urls||[]).map(threadURL).filter(Boolean))],url=urls.length===1?urls[0]:'';const title=String(view.title||'Открытое обсуждение Slack').slice(0,150);
  // One entry per open discussion (window title + thread), updated as it scrolls — not a new one for every change of
  // the visible text (that filled «Материалы» with hundreds of copies of one channel). Earlier copies are removed.
  const id='slack-view:'+createHash('sha256').update(title+'\n'+url).digest('hex').slice(0,24);const previous=this.store.items.find(x=>x.id===id);if(previous&&previous.text===text&&this.now()-previous.at<60000)return id;
  const copies=this.store.items.filter(x=>x.opened&&x.source==='Slack'&&x.id!==id&&x.title===title&&(x.url||'')===url).map(x=>x.id);if(copies.length)this.store.remove(copies);
  this.store.put([{id,source:'Slack',opened:true,title,text,url,at:this.now()}]);return id;}catch(e){this.status='Не удалось прочитать открытый тред Slack: '+e.message;}finally{this.busy=false;}}
 async collect({contextual=false,currentOnly=false,viewId=''}={}){const observed=viewId?'':await this.observe();if(currentOnly&&!observed)throw Error(this.status||'Откройте нужный тред в активном приложении Slack и повторите команду.');const selected=viewId||(currentOnly?observed:'');this.store.prune();const views=this.store.items.filter(x=>x.opened&&x.source==='Slack'&&(!selected||x.id===selected)&&(!contextual||this.now()-x.at<10*60000)).sort((a,b)=>b.at-a.at).slice(0,contextual?1:8);if(!views.length)throw Error(this.status||(contextual?'Что именно посмотреть? Откройте нужный тред в Slack или прикрепите файл/скриншот. ':'')+'Нет сохранённых открытых обсуждений Slack. Откройте нужный тред в приложении Slack на несколько секунд и повторите вопрос.');
 const candidates=[];for(const saved of views){const view={...saved};const threads=this.store.items.filter(x=>!x.opened&&x.source==='Slack');let related=threads.filter(x=>view.url&&x.url===view.url);
 if(!view.url){const matches=threads.filter(x=>(x.messages||[]).some(m=>m.text?.trim().length>=60&&view.text.includes(m.text.trim())||(m.files||[]).some(f=>f.name?.length>=5&&view.text.includes(f.name))));if(matches.length===1){related=matches;view.url=matches[0].url;}else if(matches.length>1&&matches.some(x=>(x.messages||[]).some(m=>m.files?.length)))throw Error('В открытом обсуждении подходят логи из нескольких тредов. Откройте нужное сообщение с текстом ошибки или прикрепите конкретный лог.');}
const files=related.flatMap(x=>(x.messages||[]).flatMap(m=>m.files||[]));if(contextual||logPattern.test(view.text)||related.some(x=>logPattern.test(x.text))||files.length)candidates.push({view,related,files});}
 if(!candidates.length)throw Error('В последних открытых обсуждениях не видно текста ошибки или доступного лога. Откройте сообщение с ошибкой либо прикрепите лог к Пете.');
 // Prefer the most recently viewed matching discussion; never call API recency “opened”.
 const {view,related,files}=candidates[0];const notes=[];let live=[];
 if(view.url){const u=new URL(view.url),channel=u.pathname.split('/')[2],digits=u.pathname.split('/')[3].slice(1);const ts=digits.slice(0,-6)+'.'+digits.slice(-6);try{const s=this.settings();const data=await this.request('https://slack.com/api/conversations.replies?'+new URLSearchParams({channel,ts,limit:'100'}),{headers:{Authorization:'Bearer '+(s.slackToken||'')}});if(!data.ok)throw Error(data.error);live=data.messages||[];if(data.has_more||data.response_metadata?.next_cursor)notes.push('Тред длинный: прочитана только первая страница.');}catch(e){notes.push('Свежие ответы треда недоступны: '+e.message);}}
 const allFiles=[...files,...live.flatMap(m=>m.files||[])];const unique=[...new Map(allFiles.map(f=>[f.id,f])).values()].filter(f=>/\.(?:log|txt|out|json|xml|yaml|yml|csv)$/iu.test(f.name||'')).slice(0,3);
 const attachments=[{name:'Видимое обсуждение Slack',text:excerpt(view.text),note:'Снимок видимого треда от '+new Date(view.at).toISOString()+'. Интерфейс может содержать соседние сообщения; не смешивай разные сборки.'}];
 if(live.length||related.length)attachments.push({name:'Сообщения треда',text:excerpt(live.length?live.map(m=>m.text||'').join('\n'):related.map(x=>x.text).join('\n'))});
 for(const file of unique)try{attachments.unshift({name:file.name,text:await downloadLog(file,await this.token())});}catch(e){notes.push(file.name+': '+e.message);}
 let budget=60000;for(const a of attachments){if(a.text.length>budget)a.note=(a.note||'')+' Материал сокращён.';a.text=a.text.slice(0,budget);budget-=a.text.length;}
 return {attachments:attachments.filter(a=>a.text),viewId:view.id,url:view.url,title:view.title,at:view.at,notes,evidence:live.filter(m=>m.text).slice(0,100).map(m=>({name:'Сообщение Slack',text:m.text.slice(0,10000),url:view.url.replace(/p\d+/, 'p'+m.ts.replace('.',''))}))};
 }
}
module.exports={SlackLogs,isLogQuestion,downloadLog,threadURL,excerpt,readDesktop};
