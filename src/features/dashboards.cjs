// Dashboards (src/dashboards.cjs for the model): built from a chat («Сделать дашбордом»), from single cards
// («В дашборд…»), or from a description («Собери дашборд: баги спринта, крэши за неделю»). Widgets refresh
// through their sources in a sandbox: an extension's read runs as if in an empty chat, nothing is written to
// the dialogue. Personal dashboards are kept in the dialogue state (encrypted with it); shared ones are files in
// the project's `.petya/dashboards/`; refreshed data is cached in `dashboards-cache.json` (encrypted).
const fs=require('node:fs'),path=require('node:path');
const model=require('../dashboards.cjs');
const jira=require('../extensions/jira/dashboard.cjs');
const root=path.join(__dirname,'../extensions');
const providers=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(root,e.name,'desktop-reply.cjs')).filter(f=>fs.existsSync(f))
  .map(f=>require(f)).filter(p=>p.type&&typeof p.answer==='function'&&typeof p.scope==='function');
const read=file=>{try{const st=fs.statSync(file);return st.isFile()&&st.size<=1000000?fs.readFileSync(file,'utf8'):'';}catch{return '';}};
const list=dir=>{try{return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name);}catch{return [];}};
const LOAD_MS=90000;
const cap=v=>{const t=String(v||'').trim();return t?t[0].toUpperCase()+t.slice(1):t;};

function setup(s){
  // Extension features that put their reads on dashboards: `dashboard: {accepts(command), widgets, size?, ready?,
  // connect?, names?, sources?, load?}` (docs/dashboards.md). `load` replaces `turn` for apps whose chat answer comes
  // from elsewhere (Google Play's ANR) or that take a chosen source (Метрики игры).
  const ui=require('./extension-ui.cjs');
  const plugins=new Map();ui.descriptors.filter(d=>d.feature).forEach((d,i)=>{const mod=ui.features[i];if(mod?.dashboard&&typeof mod.dashboard.accepts==='function'&&(typeof mod.turn==='function'||typeof mod.dashboard.load==='function'))plugins.set(d.id,{d,mod});});
  const byKey=new Map();for(const d of ui.descriptors)for(const key of Object.keys(d.results||{}))byKey.set(key,d.id);
  const installed=id=>{const d=ui.descriptors.find(x=>x.id===id);return !!d&&(!d.setting||s.settings[d.setting]==='true');};
  // Connected: an app that says how (`dashboard.ready(settings)`) and a source it names; others count as connected.
  const call=(fn,...a)=>{try{return typeof fn==='function'?fn(...a):undefined;}catch{return undefined;}};
  const ready=e=>typeof e.mod.dashboard.ready!=='function'||!!call(e.mod.dashboard.ready,s.settings||{});
  const usable=(id,e)=>installed(id)&&ready(e);
  const ownNames=e=>[e.d.name,e.d.id,...(call(e.mod.dashboard.names,s.settings||{})||[])];
  const subSources=e=>call(e?.mod?.dashboard?.sources,s.settings||{})||[];
  const named=(hint,names)=>names.some(n=>model.mentions(hint,n));
  const state=()=>{const st=s.dialogue.state;if(!Array.isArray(st.dashboards))st.dashboards=[];if(!st.dashboardStart||typeof st.dashboardStart!=='object')st.dashboardStart={};return st;};
  const save=()=>s.dialogue.persist();
  const project=id=>s.dialogue.state.projects?.find(p=>p.id===id)||null;
  const folders=projectId=>{try{return s.projectShare?.folders(projectId)||[];}catch{return [];}};

  // --- Cache of refreshed data ---------------------------------------------------------------------------------
  const cacheFile=()=>path.join(s.dataRoot,'dashboards-cache.json');
  let cache=null,cacheTimer=null;
  const crypt=()=>{try{const {safeStorage}=require('electron');return safeStorage?.isEncryptionAvailable?.()?safeStorage:null;}catch{return null;}};
  function loadCache(){if(cache)return cache;cache=new Map();try{const raw=JSON.parse(fs.readFileSync(cacheFile(),'utf8'));const c=crypt();if(c&&raw.encrypted)for(const [k,v] of Object.entries(JSON.parse(c.decryptString(Buffer.from(raw.encrypted,'base64')))))cache.set(k,v);}catch{}return cache;}
  function storeCache(){clearTimeout(cacheTimer);cacheTimer=setTimeout(()=>{const c=crypt();if(!c||!s.dataRoot)return;try{const file=cacheFile();fs.writeFileSync(file+'.tmp',JSON.stringify({encrypted:c.encryptString(JSON.stringify(Object.fromEntries(loadCache()))).toString('base64')}),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}},500);cacheTimer.unref?.();}
  const cacheKey=(d,w)=>d.id+'|'+w.id;

  // --- Dashboards: personal and shared ---------------------------------------------------------------------------
  function shared(projectId){
    const out=[];folders(projectId).forEach((dir,index)=>{for(const d of model.readShared(dir,{read,list}))out.push({...d,id:'shared:'+projectId+':'+index+':'+d.file,projectId,shared:{index,folder:path.basename(dir),file:d.file}});});
    return out;
  }
  function all(projectId){
    const own=state().dashboards.filter(d=>!projectId||d.projectId===projectId);
    const projects=projectId?[projectId]:(s.dialogue.state.projects||[]).filter(p=>!p.archived).map(p=>p.id);
    return [...own,...projects.flatMap(shared)];
  }
  function find(id){
    const own=state().dashboards.find(d=>d.id===id);if(own)return own;
    const m=String(id||'').match(/^shared:(.+):(\d+):([a-z0-9-]+\.json)$/);if(m){const d=shared(m[1]).find(x=>x.id===id);if(d)return d;}
    throw Error('Дашборд не найден.');
  }
  // Every change goes through here: personal ones are saved with the dialogue, shared ones are written to git.
  function commit(d){
    const clean=model.dashboard(d);
    if(d.shared){const dir=folders(d.projectId)[d.shared.index];if(!dir)throw Error('Папка проекта не найдена.');model.writeShared(dir,d.shared.file,clean);return {...clean,id:d.id,projectId:d.projectId,shared:d.shared};}
    const list=state().dashboards,i=list.findIndex(x=>x.id===d.id);if(i<0){list.push(clean);changed();}else{if(list[i].title!==clean.title)changed();list[i]=clean;}save();return clean;
  }
  function view(d){
    const c=loadCache();
    return {id:d.id,title:d.title,projectId:d.projectId,shared:d.shared?{folder:d.shared.folder}:null,fromChat:d.fromChat||'',demo:!!d.demo,start:state().dashboardStart[d.projectId]===d.id,
      // Reading order (the small window, screen readers): top to bottom, left to right.
      widgets:[...d.widgets].sort((a,b)=>(a.pos?a.pos.y:1e9)-(b.pos?b.pos.y:1e9)||(a.pos?.x||0)-(b.pos?.x||0)).map(w=>{const hit=w.source.kind==='snapshot'?{data:w.data,text:w.text,at:w.at}:c.get(cacheKey(d,w))||{};
        return {id:w.id,title:w.title,size:w.size,pos:w.pos||null,every:w.every,kind:w.source.kind,live:w.source.kind!=='snapshot',describe:describe(w.source),chat:w.chat||null,...(w.source.kind==='web'?{url:w.source.url}:{}),
          data:hit.data||null,text:hit.text||'',at:hit.at||0,error:hit.error||'',choice:hit.error&&hit.choice||null,count:hit.count??null,chosen:w.source.kind==='extension'&&!!w.source.selected&&plugins.get(w.source.extension)?.mod?.dashboard?.choosable===true,loading:running.has(cacheKey(d,w))};})};
  }
  const describe=src=>src.kind==='extension'?(plugins.get(src.extension)?.d.name||src.extension)+' · «'+src.command+'»'+(src.selected?' · '+(subSources(plugins.get(src.extension)).find(x=>x.id===src.selected)?.name||src.selected):''):src.kind==='provider'?(providers.find(p=>p.type===src.provider)?.name||src.provider)+' · «'+src.query+'»':src.kind==='jira'?'Jira · '+src.jql:src.kind==='web'?'Страница · '+(()=>{try{return new URL(src.url).host;}catch{return src.url;}})():'Снимок карточки, не обновляется';
  const summary=d=>({id:d.id,title:d.title,projectId:d.projectId,shared:!!d.shared,folder:d.shared?.folder||'',widgets:d.widgets.length,start:state().dashboardStart[d.projectId]===d.id,fromChat:d.fromChat||''});

  // --- Refresh ---------------------------------------------------------------------------------------------------
  const running=new Map();
  const send=payload=>{const w=s.win;if(w&&!w.isDestroyed())w.webContents.send('dashboards',payload);popouts?.send(payload);};
  // Small windows on top of others (src/dashboard-window.cjs); one set per app, handed to this company's feature.
  let popouts=null;
  const windows=()=>popouts||(popouts=require('../dashboard-window.cjs').create({...require('electron'),smoke:s.smoke,
    api:{peek:id=>view(find(id)),refresh:(id,widgetId)=>refresh(id,widgetId,true),watch:(id,on)=>watch(id,on)},
    show:id=>{const w=s.win;if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('dashboard-open',id);}}));
  try{if(require('../dashboard-window.cjs').current())windows();}catch{}
  // The tray menu and the sidebar list follow every change of the set of dashboards.
  const changed=()=>{try{api.onChange?.();}catch{}send({list:true});};
  function sandbox(d){
    const p=project(d.projectId);
    const topic={id:'dashboard:'+d.id,title:d.title,kind:'chat',projectId:d.projectId,projectMemoryId:p?.memoryId||'',messages:[{role:'assistant',text:'',at:Date.now()}],at:Date.now()};
    const dialogue=new Proxy(s.dialogue,{get(t,k){if(k==='active')return ()=>topic;if(k==='rememberAction'||k==='persist')return ()=>{};const v=t[k];return typeof v==='function'?v.bind(t):v;}});
    const quiet={report(){},run:(...a)=>typeof a.at(-1)==='function'?a.at(-1)():undefined};
    return {topic,s:new Proxy(s,{get(t,k){if(k==='dialogue')return dialogue;if(k==='requestProgress')return quiet;if(k==='chatResults')return undefined;return t[k];}})};
  }
  async function load(d,w){
    const src=w.source,box=sandbox(d);
    if(src.kind==='jira')return jira.load(box.s,src,box.topic);
    // A web page, read in the chat browser's session (src/dashboard-web.cjs).
    if(src.kind==='web')return require('../dashboard-web.cjs').load(box.s,src);
    if(src.kind==='extension'){
      const entry=plugins.get(src.extension);
      if(!entry||!installed(src.extension))throw Error('Расширение «'+(entry?.d.name||src.extension)+'» не добавлено.');
      if(!entry.mod.dashboard.accepts(src.command))throw Error('Этот запрос не подходит для дашборда.');
      const reply=typeof entry.mod.dashboard.load==='function'?await entry.mod.dashboard.load(box.s,src.command,{selected:src.selected||'',topic:box.topic}):await entry.mod.turn(box.s,src.command);
      if(!reply)throw Error('Расширение не ответило на «'+src.command+'».');
      // The app needs a choice the widget keeps (one of several Google Play apps): asked on the card itself.
      if(reply.choice)throw Object.assign(Error(String(reply.choice.text||'Выберите вариант.')),{choice:reply.choice});
      const data=reply.extensionData||box.topic.messages.at(-1).extensionData||null;
      if(reply.error||reply.question&&!data)throw Error(String(reply.text||'Не удалось получить данные.').slice(0,400));
      return {data,text:String(reply.text||'').slice(0,2000)};
    }
    if(src.kind==='provider'){
      const p=providers.find(x=>x.type===src.provider);if(!p)throw Error('Источник больше недоступен.');
      if(p.service)s.modules?.assertEnabled?.(s.settings,p.type);
      const scope=p.scope(box.s,box.topic);if(src.selected)p.select?.(scope,src.selected);
      const blocks=await p.answer(src.query,scope);
      const charts=blocks.filter(b=>b.type==='chart'&&b.chart).map(b=>b.chart);
      return {data:charts.length?{charts}:null,text:blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n').slice(0,2000)};
    }
    return {data:w.data,text:w.text};
  }
  async function refreshWidget(d,w,{force=false}={}){
    if(w.source.kind==='snapshot')return;
    const key=cacheKey(d,w),c=loadCache(),hit=c.get(key);
    if(!force&&hit?.at&&(!w.every||Date.now()-hit.at<w.every*60000))return;
    if(running.has(key))return running.get(key);
    const job=(async()=>{
      send({id:d.id,widgetId:w.id,loading:true});
      let timer;
      try{
        const p=project(d.projectId);
        const result=await Promise.race([require('../modules.cjs').withProject(p,()=>load(d,w)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Источник не ответил за 90 секунд.')),LOAD_MS);})]);
        const count=Array.isArray(result.data?.jiraItems)?result.data.jiraItems.length:result.count??null;
        c.set(key,{data:result.data,text:result.text,at:Date.now(),error:'',count,choice:null});
      }catch(e){
        const choice=e.choice&&Array.isArray(e.choice.options)?{options:e.choice.options.slice(0,1000).map(o=>({id:String(o.id||'').slice(0,200),label:String(o.label||o.id||'').slice(0,120)})).filter(o=>o.id)}:null;
        c.set(key,{...(hit||{}),error:String(e.message||e).slice(0,300),choice,failedAt:Date.now(),at:hit?.at||0});}
      finally{clearTimeout(timer);running.delete(key);storeCache();}
      send({id:d.id,widgetId:w.id,loading:false});
    })();
    running.set(key,job);return job;
  }
  async function refresh(id,widgetId='',force=false){
    const d=find(id),targets=d.widgets.filter(w=>!widgetId||w.id===widgetId);
    // Two at a time: a dashboard of Jira, Sentry and stores does not hit one service all at once.
    const queue=[...targets];await Promise.all([0,1].map(async()=>{while(queue.length)await refreshWidget(d,queue.shift(),{force});}));
    return view(find(id));
  }
  // Open dashboards (the view, the start screen) and the start dashboards refresh in the background.
  const watching=new Map();
  const watch=(id,on)=>{const n=(watching.get(id)||0)+(on?1:-1);if(n>0)watching.set(id,n);else watching.delete(id);return true;};
  const tick=()=>{for(const id of new Set([...watching.keys(),...Object.values(state().dashboardStart)]))try{refresh(id).catch(()=>{});}catch{}};
  const timer=setInterval(tick,60000);timer.unref?.();

  // --- Widgets from chat messages -------------------------------------------------------------------------------
  const hasCard=m=>m?.role==='assistant'&&!m.error&&(m.jiraItems?.length||m.extensionResult&&Object.keys(m.extensionData||{}).length||Object.keys(m.extensionData||{}).some(k=>k!=='attachments'&&k!=='extensionOffer'));
  function commandBefore(topic,index){for(let i=index-1;i>=0;i--)if(topic.messages[i]?.role==='user')return String(topic.messages[i].text||'').replace(/^петя[,!\s]+/iu,'').trim();return '';}
  function fromMessage(topic,index){const w=cardWidget(topic,index);seeds.set(w,topic.messages[index]);return w;}
  function cardWidget(topic,index){
    const m=topic.messages[index];if(!m||m.role!=='assistant')throw Error('Сообщение не найдено.');
    const command=commandBefore(topic,index),chat={topicId:topic.id,index};
    const name=cap(command).slice(0,80)||m.by||'Карточка';
    if(m.extensionResult?.provider&&providers.some(p=>p.type===m.extensionResult.provider))return model.widget({title:name,size:'auto',chat,source:{kind:'provider',provider:m.extensionResult.provider,query:m.extensionResult.query||command,selected:m.extensionResult.selected}});
    if(m.jiraItems?.length){
      const keys=[...new Set(m.jiraItems.map(i=>i.key))].slice(0,50);
      const phrase=jira.jqlFor(command,jira.projectsOf(s,topic));
      return model.widget({title:name||'Задачи Jira',size:'auto',chat,source:{kind:'jira',jql:phrase||'key in ('+keys.join(', ')+') ORDER BY updated DESC'}});
    }
    // The app that answered: by its name on the message (kit.reply sets `by`), then by the card's data key.
    const ids=[...[...plugins].filter(([,e])=>e.d.name===m.by).map(([id])=>id),...Object.keys(m.extensionData||{}).map(key=>byKey.get(key))];
    for(const id of ids){
      const entry=plugins.get(id);
      if(entry&&command&&entry.mod.dashboard.accepts(command))return model.widget({title:name,size:entry.mod.dashboard.size||'auto',chat,source:{kind:'extension',extension:id,command}});
    }
    const data={...(m.extensionData||{})};if(m.jiraItems)data.jiraItems=m.jiraItems;
    return model.widget({title:name,size:'auto',chat,source:{kind:'snapshot'},data,text:String(m.text||'').slice(0,4000),at:m.at});
  }
  // A card added from the chat shows its data at once; its source refreshes it afterwards.
  const seeds=new WeakMap();
  function seed(d,w){const m=seeds.get(w);if(!m||w.source.kind==='snapshot')return;const c=loadCache(),key=cacheKey(d,w);if(c.has(key))return;
    const data={...(m.extensionData||{})};if(m.jiraItems)data.jiraItems=m.jiraItems;c.set(key,{data,text:String(m.text||'').slice(0,2000),at:m.at||Date.now(),error:'',count:Array.isArray(data.jiraItems)?data.jiraItems.length:null});storeCache();}
  const same=(a,b)=>JSON.stringify(a.source)===JSON.stringify(b.source)&&(a.source.kind!=='snapshot'||a.chat?.index===b.chat?.index);
  function add(d,w){const i=d.widgets.findIndex(x=>same(x,w));if(i>=0){d.widgets[i]={...d.widgets[i],source:w.source,chat:w.chat};seeds.set(d.widgets[i],seeds.get(w));seed(d,d.widgets[i]);}else{if(d.widgets.length>=model.LIMIT.widgets)throw Error('В дашборде уже '+model.LIMIT.widgets+' виджетов.');d.widgets.push(w);seed(d,w);}}
  // A dashboard made from a chat takes the chat's new cards when it is opened.
  function sync(d){
    if(!d.fromChat||d.shared)return d;
    const topic=s.dialogue.state.topics.find(t=>t.id===d.fromChat);if(!topic)return d;
    let changed=false;topic.messages.forEach((m,i)=>{if((m.at||0)>(d.synced||0)&&hasCard(m)){try{add(d,fromMessage(topic,i));changed=true;}catch{}}});
    const last=topic.messages.at(-1)?.at||0;if(last>(d.synced||0)){d.synced=last;changed=true;}
    return changed?commit(d):d;
  }
  function fromChat(topicId){
    const topic=s.dialogue.state.topics.find(t=>t.id===topicId);if(!topic)throw Error('Чат не найден.');
    const existing=state().dashboards.find(d=>d.fromChat===topicId);if(existing){sync(existing);return view(find(existing.id));}
    const d=model.dashboard({title:topic.title||'Дашборд',projectId:topic.projectId||'general',fromChat:topicId,synced:0,widgets:[]});
    topic.messages.forEach((m,i)=>{if(hasCard(m))try{add(d,fromMessage(topic,i));}catch(e){if(process.env.DASH_DEBUG)console.error(e);}});
    if(!d.widgets.length)throw Error('В этом чате пока нет карточек с данными: спросите Петю про задачи, крэши, отзывы или сборки — и сделайте дашборд снова.');
    d.synced=topic.messages.at(-1)?.at||Date.now();
    const saved=commit(d);refresh(saved.id).catch(()=>{});return view(saved);
  }

  // --- «Собери дашборд: …» -------------------------------------------------------------------------------------
  // Each phrase is a request one source accepts: an extension's read, Jira issues by JQL, or a provider's read.
  function catalog(projectId){
    const rows=[];
    for(const [id,e] of plugins)if(usable(id,e)){const list=typeof e.mod.dashboard.widgets==='function'?call(e.mod.dashboard.widgets,s)||[]:e.mod.dashboard.widgets||[];
      for(const w of list)if(w?.title&&w.command)rows.push({title:w.title,phrase:w.command,source:{kind:'extension',extension:id,command:w.command},app:e.d.name});}
    if(jira.connected(s))for(const w of jira.presets)rows.push({title:w.title,phrase:w.phrase,source:{kind:'jira',jql:jira.jqlFor(w.phrase,jira.projectsOf(s,{projectMemoryId:project(projectId)?.memoryId}))},app:'Jira'});
    return rows;
  }
  // Every phrase of a dashboard request is implicitly «покажи …»: a bare noun («краши», «ANR») is tried as such when
  // no source takes it as written.
  const FORMS=[t=>t,t=>'покажи '+t];
  // Where a phrase may go, in order. A source hint («(из wombyte)», «DAU из графаны») first selects one of an app's
  // own sources (Grafana feeding «Метрики игры», named by its host) or the app itself; then the phrase as written;
  // then, for a hint nobody knows, the phrase without it.
  function routes(phrase){
    const known=name=>[...plugins.values()].some(e=>named(name,ownNames(e))||subSources(e).some(x=>named(name,x.names||[x.name])));
    const h=model.sourceHint(phrase,known),out=[];
    if(h){
      for(const [id,e] of plugins)for(const x of subSources(e))if(named(h.name,x.names||[x.name]))out.push({id,e,text:h.body,selected:x.id,source:x});
      for(const [id,e] of plugins)if(named(h.name,ownNames(e)))out.push({id,e,text:h.body+' из '+e.d.name});
    }
    for(const [id,e] of plugins)out.push({id,e,text:phrase});
    if(h)for(const [id,e] of plugins)out.push({id,e,text:h.body});
    return out;
  }
  const accepts=(e,text)=>!!call(e.mod.dashboard.accepts,text);
  const providerOn=p=>installed(p.type)||p.service&&s.modules?.enabled?.(s.settings,p.type);
  function widgetFor(phrase,projectId){
    const list=routes(phrase),projects=jira.connected(s)?jira.projectsOf(s,{projectMemoryId:project(projectId)?.memoryId}):null;
    for(const form of FORMS){
      for(const r of list){
        // A hint that names an app's own source («(из wombyte)» = the Grafana feeding «Метрики игры») for a request
        // that app takes: that source or nothing — not the same-named app with the phrase as a dashboard name.
        if(r.source&&(!usable(r.id,r.e)||!r.source.ready)&&accepts(r.e,form(r.text)))return null;
        if(!usable(r.id,r.e)||r.source&&!r.source.ready)continue;
        const command=form(r.text);if(!accepts(r.e,command))continue;
        return model.widget({title:cap(phrase),size:r.e.mod.dashboard.size||'auto',source:{kind:'extension',extension:r.id,command,...(r.selected?{selected:r.selected}:{})}});
      }
      if(projects){const jql=jira.jqlFor(form(phrase),projects);if(jql)return model.widget({title:jira.titleFor(phrase),size:'auto',source:{kind:'jira',jql}});}
      for(const p of providers)if(providerOn(p))try{if(p.matches?.(form(phrase),{settings:s.settings,topic:null}))return model.widget({title:cap(phrase),size:'auto',source:{kind:'provider',provider:p.type,query:form(phrase)}});}catch{}
    }
    return null;
  }
  // A phrase nothing connected takes: the app that would take it, added or not, connected or not, and what to do —
  // add it, connect it (or the source the phrase names), or, for an app whose cards are not widgets yet, pin its card
  // from a chat.
  function advise(phrase){
    const list=routes(phrase);
    for(const form of FORMS)for(const r of list){
      if(!accepts(r.e,form(r.text)))continue;
      const add=!installed(r.id),missing=r.source?!r.source.ready:!ready(r.e);
      if(!add&&!missing)continue;
      if(missing&&r.source?.setup)return {phrase,add:add?r.e.d.name:'',offers:add?[r.id]:[],connect:[],where:'',todo:r.source.setup};
      const c=missing&&!r.source?call(r.e.mod.dashboard.connect,s.settings||{},phrase)||{}:{};
      if(missing&&!r.source&&c.todo)return {phrase,add:add?r.e.d.name:'',offers:add?[r.id]:[],connect:[],where:'',todo:c.todo};
      const connect=!missing?[]:r.source?[r.source.name]:c.names?.length?c.names:[r.e.d.name];
      const where=!missing?'':r.source?(call(r.e.mod.dashboard.connect,s.settings||{},phrase)||{}).where||'':c.where||'';
      return {phrase,add:add?r.e.d.name:'',offers:[...(add?[r.id]:[]),...(!missing?[]:r.source?[r.source.extension].filter(Boolean):c.offers||[])],connect,where};
    }
    if(!jira.connected(s)&&FORMS.some(f=>jira.jqlFor(f(phrase),[])))return {phrase,add:'',offers:[],connect:['Jira'],where:'Подключения → «Jira»'};
    for(const p of providers)if(!providerOn(p))try{if(FORMS.some(f=>p.matches?.(f(phrase),{settings:s.settings,topic:null})))return {phrase,add:p.name,offers:[],connect:[],where:''};}catch{}
    try{
      const o=require('./extension-offers.cjs'),pick=o.decide(o.candidates('покажи '+phrase,{offers:s.extensionOffers?.offers||[],settings:s.settings||{}}))?.one;
      if(pick)return {phrase,add:pick.offer.name,offers:[pick.offer.id],connect:[],where:'',pin:true};
    }catch{}
    return null;
  }
  const quoted=list=>list.map(m=>'«'+m+'»').join(', ');
  const tip=a=>'для «'+a.phrase+'» '+[a.add&&'добавьте «'+a.add+'»',a.todo,a.connect.length&&'подключите '+a.connect.map(n=>'«'+n+'»').join(' или ')+(a.where?' ('+a.where+')':''),a.pin&&'закрепите его карточку из чата («В дашборд…»)'].filter(Boolean).join(' и ');
  // What to say about phrases without a widget: the concrete apps where known, the generic hint otherwise.
  function missedText(missed,{none=false}={}){
    const tips=missed.map(advise),known=tips.filter(Boolean),unknown=missed.filter((m,i)=>!tips[i]);
    const offers=[...new Set(known.flatMap(a=>a.offers))];
    if(!known.length)return {text:none?'Не нашёл источников для: '+quoted(missed)+'. Подключите приложения (Jira, Крэши, Отзывы, Сборки…) в каталоге или сделайте дашборд из чата с карточками.':'Не нашёл источника для: '+quoted(missed)+'.',offers};
    const lines=known.map(tip).join('; ');
    return {text:(none?'Пока не из чего собрать дашборд: '+lines:cap(lines))+'.'+(unknown.length?' Не нашёл источника для: '+quoted(unknown)+'.':''),offers};
  }
  function compose(description,projectId){
    const {title,parts}=model.phrases(description);
    if(!parts.length)throw Error('Перечислите, что показать: например «Собери дашборд: баги спринта, крэши за неделю, отзывы».');
    const d=model.dashboard({title:title||'Дашборд',projectId:projectId||s.dialogue.state.activeProjectId||'general',widgets:[]}),missed=[];
    for(const part of parts){const w=widgetFor(part,d.projectId);if(w)add(d,w);else missed.push(part);}
    return {d,missed};
  }
  // The catalog app that would show a phrase, is not added yet and needs nothing connected: it is added right away.
  function addable(phrase){
    for(const form of FORMS)for(const r of routes(phrase)){
      if(installed(r.id)||!accepts(r.e,form(r.text)))continue;
      if(r.source?!r.source.ready:!ready(r.e))continue;
      return {id:r.id,name:r.e.d.name,setting:r.e.d.setting};
    }
    return null;
  }
  function enable(apps){
    const patch={};for(const a of apps)if(a.setting)patch[a.setting]='true';if(!Object.keys(patch).length||typeof s.saveSettings!=='function')return [];
    s.saveSettings(patch);try{const w=s.win;if(w&&!w.isDestroyed())w.webContents.send('extension-runtime',{type:'changed'});}catch{}
    return apps.filter(a=>installed(a.id));
  }
  const web=url=>{try{const u=new URL(String(url||'').trim());return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  function finish(command,d,missed,added=[]){
    let text,dashboard=null;
    const plus=added.length?' Добавил '+(added.length===1?'приложение':'приложения')+' '+added.map(a=>'«'+a.name+'»').join(', ')+'.':'';
    if(!d.widgets.length){
      const m=missedText(missed,{none:true});text=m.text+plus;
      // The apps to connect, on the shared offer card: accepting it repeats this request.
      if(m.offers.length){const offered=s.extensionOffers?.propose?.(command,m.offers,text,'Дашборды');if(offered)return offered;}
    }
    else{const saved=commit(d);dashboard={id:saved.id,title:saved.title};refresh(saved.id).catch(()=>{});
      text='Собрал дашборд «'+saved.title+'»: '+saved.widgets.map(w=>w.title).join(', ')+'.'+plus+(missed.length?' '+missedText(missed).text:'')+' Он в списке проекта слева.';}
    s.dialogue.rememberAction(command,text);
    const t=s.dialogue.active(),message=t.messages.at(-1);if(dashboard)message.dashboard=dashboard;s.dialogue.persist();
    return {handled:true,text,topicId:t.id,topicTitle:t.title,messages:t.messages,...(dashboard?{dashboard}:{})};
  }
  // «Собери дашборд: …». What an added app shows becomes a widget; an app that would show it and needs nothing
  // connected is added right away; for one that needs a connection the reply says which (and the offer card brings
  // it); for what no app shows Petya asks for a page and reads it in the chat browser, where the person signs in.
  function turn(command){
    if(!model.wantsDashboard(command))return null;
    const topic=s.dialogue.active();
    const projectId=topic?.projectId||s.dialogue.state.activeProjectId||'general';
    let composed;
    try{composed=compose(command,projectId);}catch(e){s.dialogue.rememberAction(command,e.message);const t=s.dialogue.active();return {handled:true,text:e.message,topicId:t.id,topicTitle:t.title,messages:t.messages};}
    let apps=[...new Map(composed.missed.map(addable).filter(Boolean).map(a=>[a.id,a])).values()];
    if(apps.length){apps=enable(apps);if(apps.length)composed=compose(command,projectId);}
    const {d,missed}=composed;
    const pages=missed.filter(m=>!advise(m));
    if(!pages.length)return finish(command,d,missed,apps);
    const list=pages.map(m=>'«'+m+'»').join(', ');
    return require('../input-required.cjs').ask({
      text:(d.widgets.length?'Собрал: '+d.widgets.map(w=>w.title).join(', ')+'. ':'')+'Для '+list+' в Пете нет приложения. Пришлите ссылку на страницу, где это видно (например, дашборд сервиса аналитики), — я открою её в браузере рядом с чатом, вы войдёте, и виджет будет брать данные оттуда. Или соберу без этого.',
      label:'Ссылка на страницу',placeholder:'https://…',options:['Собрать без этого']},
     answer=>{
      const url=web(answer);
      if(!url)return finish(command,d,missed,apps);
      for(const m of pages)add(d,model.widget({title:cap(m),size:'auto',source:{kind:'web',url,query:m}}));
      const out=finish(command,d,missed.filter(m=>!pages.includes(m)),apps);
      // The page opens next to the chat: the person signs in there once, the widget reads it in the same session.
      const chat=s.dialogue.active()?.id;if(chat&&s.chatBrowser)s.chatBrowser.attend(chat,{url,message:'Войдите, если сайт попросит, — виджет дашборда будет брать данные с этой страницы.'}).catch(()=>{});
      return out;
     });
  }

  // --- IPC -------------------------------------------------------------------------------------------------------
  const own=id=>{const d=find(id);return d;};
  // A control on a widget's card («Исправить», a status chip, a checkbox): the same adapter action as in the chat, run
  // on the widget's own data in the dashboard's sandbox — the open chat knows nothing about these cards.
  async function cardAction(id,widgetId,key,actionId,args){
    const d=find(id),w=d.widgets.find(x=>x.id===widgetId);if(!w)throw Error('Виджет не найден.');
    if(args!==undefined&&(typeof args!=='object'||args===null||JSON.stringify(args).length>20000))throw Error('Некорректные параметры действия.');
    const shown=w.source.kind==='snapshot'?{data:w.data,text:w.text}:loadCache().get(cacheKey(d,w))||{};
    const box=sandbox(d);const message=box.topic.messages[0];Object.assign(message,{extensionData:shown.data||{},...(shown.data||{}),text:shown.text||''});
    const results=require('./chat-results.cjs');
    const row=results.collect(box.topic,box.s).find(r=>r.presentationKey===key);if(!row)throw Error('Карточка устарела. Обновите виджет.');
    const action=row.actions.find(a=>a.id===actionId);if(!action)throw Error('Действие больше недоступно.');
    if(action.command)return {command:action.command};
    const project=s.dialogue.state.projects.find(p=>p.id===(d.projectId||'general'));
    const out=await require('../modules.cjs').withProject(project,()=>row.adapter.perform(actionId,row,box.s,()=>{},args));
    // Its data changed (a status, a checkbox): the widget is refreshed so the card shows it.
    if(out&&!out.topicId)refresh(d.id,w.id,true).catch(()=>{});
    return out;
  }
  const ipc={
    list:(projectId='')=>all(projectId||'').map(summary),
    get:id=>{const d=sync(find(id));refresh(d.id).catch(()=>{});return view(find(d.id));},
    peek:id=>view(find(id)),
    listForChat:topicId=>{const t=s.dialogue.state.topics.find(x=>x.id===topicId);return all(t?.projectId||s.dialogue.state.activeProjectId||'general').map(summary);},
    watch:(id,on=true)=>watch(id,!!on),
    popout:id=>{const d=find(id);windows().open(d.id,d.title);return true;},
    refresh:(id,widgetId='')=>refresh(id,widgetId,true),
    cardAction:(id,widgetId,key,actionId,args)=>cardAction(String(id),String(widgetId),String(key),String(actionId),args),
    fromChat:topicId=>fromChat(String(topicId||'')),
    chatDashboard:topicId=>{const d=state().dashboards.find(x=>x.fromChat===topicId);return d?summary(d):null;},
    pin:(dashboardId,topicId,index)=>{
      const topic=s.dialogue.state.topics.find(t=>t.id===topicId);if(!topic)throw Error('Чат не найден.');
      const w=fromMessage(topic,Number(index));
      let d;if(dashboardId)d=own(dashboardId);else{d=model.dashboard({title:'Мой дашборд',projectId:topic.projectId||'general',widgets:[]});}
      add(d,w);const saved=commit(d);refresh(saved.id).catch(()=>{});return {dashboard:summary(saved),widget:w.title,live:w.source.kind!=='snapshot'};
    },
    create:(title,projectId)=>summary(commit(model.dashboard({title:String(title||'').trim()||'Дашборд',projectId:projectId||s.dialogue.state.activeProjectId||'general',widgets:[]}))),
    compose:(description,projectId,title='')=>{const {d,missed}=compose('собери дашборд: '+String(description||''),projectId);if(!d.widgets.length)throw Error(missedText(missed).text);if(title)d.title=String(title).trim().slice(0,model.LIMIT.title)||d.title;const saved=commit(d);refresh(saved.id).catch(()=>{});return {dashboard:summary(saved),missed};},
    // Adds widgets from a description to an existing dashboard («Добавить: крэши за неделю»).
    addFrom:(id,description)=>{const d=own(id),parts=model.phrases('собери дашборд: '+String(description||'')).parts,missed=[];
      for(const part of parts){const w=widgetFor(part,d.projectId);if(w)add(d,w);else missed.push(part);}
      if(parts.length===missed.length)throw Error(missedText(missed).text);
      commit(d);refresh(d.id).catch(()=>{});return {view:view(find(id)),missed,note:missed.length?missedText(missed).text:''};},
    catalog:projectId=>catalog(projectId||s.dialogue.state.activeProjectId||'general'),
    addSource:(id,src,title)=>{const d=own(id);add(d,model.widget({title,source:src}));commit(d);refresh(d.id).catch(()=>{});return view(find(id));},
    rename:(id,title)=>{const d=own(id);d.title=String(title||'').trim().slice(0,model.LIMIT.title)||d.title;commit(d);return view(find(id));},
    widget:(id,widgetId,patch={})=>{const d=own(id),w=d.widgets.find(x=>x.id===widgetId);if(!w)throw Error('Виджет не найден.');
      if(patch.title!==undefined)w.title=String(patch.title).trim().slice(0,model.LIMIT.title)||w.title;
      if(patch.size!==undefined){if(!model.SIZES.includes(patch.size))throw Error('Неизвестный размер.');w.size=patch.size;}
      if(patch.every!==undefined){if(!model.EVERY.includes(Number(patch.every)))throw Error('Неизвестный интервал.');if(w.source.kind!=='snapshot')w.every=Number(patch.every);}
      if(patch.jql!==undefined&&w.source.kind==='jira'){w.source=model.source({kind:'jira',jql:patch.jql});loadCache().delete(cacheKey(d,w));}
      // The answer to the card's own question (which Google Play app): kept with the source, read again at once.
      const chose=patch.selected!==undefined&&w.source.kind==='extension';
      if(chose){w.source=model.source({...w.source,selected:String(patch.selected||'')});loadCache().delete(cacheKey(d,w));}
      commit(d);if(patch.jql!==undefined||chose)refresh(d.id,w.id,true).catch(()=>{});return view(find(id));},
    removeWidget:(id,widgetId)=>{const d=own(id),i=d.widgets.findIndex(x=>x.id===widgetId);if(i<0)throw Error('Виджет не найден.');const [w]=d.widgets.splice(i,1);commit(d);return {view:view(find(id)),undo:{widget:w,index:i}};},
    restoreWidget:(id,widget,index)=>{const d=own(id),w=model.widget(widget);d.widgets.splice(Math.max(0,Math.min(Number(index)||0,d.widgets.length)),0,w);commit(d);return view(find(id));},
    // The person's arrangement: positions and sizes on the 12-column grid, all widgets at once.
    layout:(id,items)=>{const d=own(id);if(!Array.isArray(items)||items.length>model.LIMIT.widgets)throw Error('Неверная раскладка.');
      for(const row of items){const w=d.widgets.find(x=>x.id===row?.id);if(!w)continue;const pos=model.position(row);if(pos)w.pos=pos;else delete w.pos;}
      commit(d);return view(find(id));},
    move:(id,order)=>{const d=own(id);if(!Array.isArray(order))throw Error('Неверный порядок.');const rank=new Map(order.map((wid,i)=>[wid,i]));d.widgets.sort((a,b)=>(rank.get(a.id)??999)-(rank.get(b.id)??999));commit(d);return view(find(id));},
    remove:id=>{const d=find(id);
      if(d.shared){const dir=folders(d.projectId)[d.shared.index];if(dir)try{fs.unlinkSync(path.join(dir,model.DIR,d.shared.file));}catch{}}
      else state().dashboards=state().dashboards.filter(x=>x.id!==id);
      for(const [k,v] of Object.entries(state().dashboardStart))if(v===id)delete state().dashboardStart[k];
      for(const w of d.widgets)loadCache().delete(cacheKey(d,w));storeCache();save();changed();return true;},
    start:(projectId,id)=>{const st=state();if(id){const d=find(id);if(d.projectId!==projectId)throw Error('Дашборд из другого проекта.');st.dashboardStart[projectId]=id;}else delete st.dashboardStart[projectId];save();return true;},
    startOf:projectId=>{const id=state().dashboardStart[projectId||s.dialogue.state.activeProjectId];if(!id)return null;try{const d=sync(find(id));refresh(d.id).catch(()=>{});return view(find(d.id));}catch{delete state().dashboardStart[projectId];return null;}},
    // Share: the definition goes to the project's git; snapshots (someone's data) stay in a personal dashboard.
    folders:projectId=>folders(projectId).map((dir,index)=>({index,name:path.basename(dir)})),
    share:(id,index)=>{const d=state().dashboards.find(x=>x.id===id);if(!d)throw Error('Поделиться можно личным дашбордом.');
      const dir=folders(d.projectId)[Number(index)];if(!dir)throw Error('У проекта нет папки. Добавьте папку в настройках проекта.');
      const live=d.widgets.filter(w=>w.source.kind!=='snapshot'),kept=d.widgets.length-live.length;
      if(!live.length)throw Error('В дашборде только снимки карточек — их данные личные. Добавьте обновляемые виджеты.');
      const file=model.writeShared(dir,'',{...d,widgets:live});
      const sharedId='shared:'+d.projectId+':'+Number(index)+':'+file;
      for(const w of live){const v=loadCache().get(cacheKey(d,w));if(v)loadCache().set(sharedId+'|'+w.id,v);}storeCache();
      if(kept)d.widgets=d.widgets.filter(w=>w.source.kind==='snapshot');else state().dashboards=state().dashboards.filter(x=>x.id!==id);
      if(state().dashboardStart[d.projectId]===id)state().dashboardStart[d.projectId]=sharedId;save();changed();
      return {id:sharedId,file:path.join(model.DIR,file),folder:path.basename(dir),kept};},
    // «Пример: аналитика игры»: made-up numbers, to see analytics on a dashboard before an analytics app is connected.
    example:projectId=>{const e=require('../dashboard-example.cjs').example();const d=commit(model.dashboard({...e,projectId:projectId||s.dialogue.state.activeProjectId||'general'}));return summary(d);},
    copy:id=>{const d=find(id);const copy=model.dashboard({title:d.title,projectId:d.projectId,widgets:d.widgets.map(w=>({...w,id:undefined}))});return summary(commit(copy));}
  };
  const api={turn,list:all,find,view,refresh,fromChat,compose,advise,onChange:null,
    // The tray menu: start dashboards first, then the rest.
    menu:()=>all('').sort((a,b)=>Number(state().dashboardStart[b.projectId]===b.id)-Number(state().dashboardStart[a.projectId]===a.id)).slice(0,10).map(d=>({id:d.id,title:d.title}))};
  return {dashboards:api,ipc};
}
module.exports={name:'dashboards',setup};
