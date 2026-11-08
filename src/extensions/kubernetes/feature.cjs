// «Kubernetes»: pods and their problems (CrashLoopBackOff, OOMKilled, restarts, image pulls), warning events,
// one pod in detail (a describe summary, events, the previous container's last lines and a grounded «почему»),
// the rollout state of a deployment. Everything is read through kubectl without a shell (kubectl.cjs), in the
// context and namespace from the settings or the kubeconfig. A chat turn only reads; restarting or scaling a
// deployment runs from the card after the user pressed the confirming button that shows the exact kubectl command,
// with the context, namespace and deployment re-checked first. Petya never execs into pods.
// Pod logs are «Логи сервера»: this extension provides its `log-source` (log-source.cjs).
const kit=require('../app-kit.cjs');
const K=require('./kubectl.cjs');
const runtime=require('./runtime.cjs');
const {ask}=require('../../input-required.cjs');
const ID='kubernetes',BY='Kubernetes',NOTICE='kubernetes-operation';
const state={busy:null,operation:null,names:new Set()};

// --- Routing -------------------------------------------------------------------------------------------------
const K8S=/(?:^|[^\p{L}])(?:kubernetes|k8s|кубер\p{L}*|кубернетес\p{L}*|kubectl|кубектл\p{L}*|куб(?:е|а|у)?)(?=$|[^\p{L}])/iu;
const PODS=/(?:^|[^\p{L}])(?:поды|подов|подам|подах|pods?)(?=$|[^\p{L}])/iu;
const POD_ONE=/(?:^|[^\p{L}])под(?:а|ом|у|е)?\s+[«"'`]?[a-z0-9][a-z0-9-]*/iu;
const OBJECTS=/деплойме?нт\p{L}*|(?:^|[^\p{L}])(?:deployments?|deploy\/|statefulset\p{L}*|daemonset\p{L}*|namespace\p{L}*|неймспейс\p{L}*|crashloop\p{L}*|crashloopbackoff|imagepullbackoff|errimagepull|oomkilled)(?=$|[^\p{L}])/iu;
const LOGS=/(?:^|[^\p{L}])(?:лог(?:и|ов|ам|ах|а)?|logs?)(?=$|[^\p{L}])/iu;
const RESTART=/(?:^|[^\p{L}])(?:перезапусти\p{L}*|перезагрузи\p{L}*|рестартани|рестартни|рестарт|restart|передеплой\p{L}*|redeploy)(?=$|[^\p{L}])/iu;
const SCALE=/(?:^|[^\p{L}])(?:отскейл\p{L}*|скейлни|масштабир\p{L}*|scale|увеличь|уменьши|поставь|сделай)(?=$|[^\p{L}])[^.?!]{0,40}(?:реплик\p{L}*|replicas?|под(?:а|ов|ы)|инстанс\p{L}*)|(?:^|[^\p{L}])(?:отскейл\p{L}*|скейлни|scale)(?=$|[^\p{L}])/iu;
const ROLLOUT=/(?:^|[^\p{L}])(?:rollout|роллаут\p{L}*|выкатк\p{L}*|выкатил\p{L}*|выкатился|раскатк\p{L}*|раскатил\p{L}*)(?=$|[^\p{L}])|статус\p{L}* деплойме?нт\p{L}*/iu;
const POD_WHY=/почему[^.?!]{0,40}(?:пада\p{L}*|упал\p{L}*|перезапуска\p{L}*|рестарт\p{L}*|crashloop\p{L}*|oom\p{L}*|не (?:стартует|запускается|поднимается|готов\p{L}*))|(?:^|[^\p{L}])(?:describe|опиши|подробн\p{L}*|детал\p{L}*)(?=$|[^\p{L}])/iu;
const EVENTS=/событи\p{L}*|(?:^|[^\p{L}])events?(?=$|[^\p{L}])/iu;
// Neighbours: Docker, monitoring and alerts, CI deploys to stores, dialogue lines («реплики персонажа»), image
// scaling, «под Windows».
const AVOID=/docker|докер|алерт|alert|prometheus|прометеус|uptime|аптайм|(?:^|[^\p{L}])(?:google play|app store|testflight|стор)(?=$|[^\p{L}])|реплик\p{L}* (?:персонаж|диалог|героя|npc)|локализац|картинк|изображени|скриншот|(?:^|[^\p{L}])под (?:windows|mac|linux|андроид|android|ios|айос|виндоус|макос)(?=$|[^\p{L}])|что такое|как (?:установить|настроить|работает)|напиши\p{L}* (?:манифест|helm|yaml)/iu;

function knownName(t){return [...state.names].some(n=>n.length>2&&new RegExp('(?:^|[^\\p{L}\\d_-])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\d_-])','iu').test(t));}
function kind(text){
 const t=String(text||'');
 if(AVOID.test(t))return null;
 // «под api» alone is a pod only with a pod question («почему падает под api») or a name seen in this cluster.
 const k8s=K8S.test(t),objects=OBJECTS.test(t),pods=PODS.test(t)||POD_ONE.test(t)&&(k8s||objects||POD_WHY.test(t)||knownName(t));
 // «статус выкатки payments»: a rollout of a named workload (a release version or a store is not one).
 const named=wanted(t).some(w=>/[a-z]/.test(w));
 const rolloutOf=ROLLOUT.test(t)&&named,scaleOf=SCALE.test(t)&&(/реплик|replica/iu.test(t)||/(?:^|[^\p{L}])(?:отскейл\p{L}*|скейлни|scale)(?=$|[^\p{L}])/iu.test(t))&&named;
 if(!k8s&&!pods&&!objects&&!rolloutOf&&!scaleOf)return null;
 if(LOGS.test(t))return null;
 if(RESTART.test(t)&&(objects||k8s||pods))return 'restart';
 if(SCALE.test(t)&&(objects||k8s||scaleOf))return 'scale';
 if(ROLLOUT.test(t))return 'rollout';
 if(POD_WHY.test(t)&&(pods||POD_ONE.test(t)))return 'pod';
 if(EVENTS.test(t))return 'events';
 return 'overview';
}
// Names the user may mean: DNS-1123 words that are not the words of the request.
const STOP=new Set(['kubernetes','k8s','kubectl','pod','pods','deployment','deployments','deploy','rollout','restart','scale','replicas','status','describe','events','namespace','crashloopbackoff','oomkilled','imagepullbackoff','errimagepull','the','in','to','statefulset','daemonset']);
function wanted(text){
 const t=String(text||'');
 const quoted=[...t.matchAll(/[«"'`]([a-z0-9][a-z0-9.-]*)[»"'`]/gi)].map(m=>m[1].toLowerCase());
 const words=(t.match(/[A-Za-z0-9][A-Za-z0-9.-]*/g)||[]).map(w=>w.toLowerCase().replace(/[.-]+$/,'')).filter(w=>!STOP.has(w)&&!/^\d+$/.test(w)&&w.length>1&&K.NAME.test(w));
 return [...new Set([...quoted,...words])];
}
function replicasOf(text){
 const m=/(?:до|на|в|to|=)\s*(\d{1,3})(?=\s*(?:реплик\p{L}*|replicas?|под\p{L}*|инстанс\p{L}*|штук\p{L}*|$|[^\p{L}\d]))|(\d{1,3})\s*(?:реплик\p{L}*|replicas?|инстанс\p{L}*)/iu.exec(String(text||''));
 const n=Number(m?.[1]??m?.[2]);return Number.isInteger(n)?n:null;
}

// --- Failures and notifications --------------------------------------------------------------------------------
const INSTALL='Для приложения «Kubernetes» нужна команда kubectl и kubeconfig с доступом к кластеру (kubectl config current-context). Петя ничего не скачивает сам.';
function problem(e){
 if(e?.kind==='missing')return 'kubectl не найден. '+INSTALL;
 return e?.message||String(e);
}
function failed(s,command,e){
 if(e?.name==='InputRequired')throw e;
 if(e?.kind==='missing')return kit.reply(s,command,{by:BY,question:true,text:'kubectl не найден на этом компьютере. '+INSTALL+' Установите kubectl (или укажите путь к нему в настройках «Kubernetes») и повторите запрос.'});
 if(e?.kind==='config')return kit.reply(s,command,{by:BY,question:true,text:'В kubeconfig не выбран контекст кластера. Выберите его в Настройках → «Kubernetes» или командой kubectl config use-context — и повторите.'});
 return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+problem(e)});
}
function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}
function remember(o){for(const x of [...(o.pods||[]),...(o.deployments||[])]){state.names.add(x.name);if(x.app)state.names.add(x.app);}while(state.names.size>300)state.names.delete(state.names.values().next().value);}

// --- Turns ------------------------------------------------------------------------------------------------------
const cluster=s=>runtime.cluster(s);
function overviewText(o){
 const bad=o.pods.filter(p=>p.problem==='bad'),warn=o.pods.filter(p=>p.problem==='warn');
 const parts=[o.context+', '+o.namespace+': '+(o.pods.length?o.pods.filter(p=>p.phase==='Running'&&p.readyCount===p.total).length+' из '+o.pods.length+' '+kit.plural(o.pods.length,['пода','подов','подов'])+' готовы.':'подов нет.')];
 if(bad.length)parts.push('С проблемами: '+bad.slice(0,4).map(p=>p.name+' ('+p.reason+(p.restarts?', перезапусков '+p.restarts:'')+')').join(', ')+'.');
 const oom=o.pods.filter(p=>p.oomKilled&&p.problem!=='bad');
 if(oom.length)parts.push('OOMKilled: '+oom.slice(0,3).map(p=>p.name).join(', ')+'.');
 else if(warn.length&&!bad.length)parts.push('Требуют внимания: '+warn.slice(0,4).map(p=>p.name+(p.restarts?' ('+p.restarts+' '+kit.plural(p.restarts,['перезапуск','перезапуска','перезапусков'])+')':' ('+p.reason+')')).join(', ')+'.');
 const rolling=o.deployments.filter(d=>d.status==='progressing'||d.status==='failed');
 if(rolling.length)parts.push('Выкатка: '+rolling.slice(0,3).map(d=>d.name+' — '+(d.status==='failed'?'не удалась':d.note)).join('; ')+'.');
 if(o.events.length)parts.push('Предупреждений в событиях: '+o.events.length+'.');
 return parts.join(' ');
}
async function overviewTurn(s,command,focus='pods'){
 s.requestProgress?.report?.('Смотрю поды в Kubernetes');
 try{const o=await cluster(s).overview();remember(o);
  const text=focus==='events'?(o.events.length?o.context+', '+o.namespace+': предупреждений '+o.events.length+'. Последнее: '+o.events[0].object+' — '+o.events[0].reason+': '+o.events[0].message.slice(0,200)+'.':o.context+', '+o.namespace+': предупреждений в событиях нет.'):overviewText(o);
  return kit.reply(s,command,{by:BY,text,data:{kubernetes:{mode:'overview',focus,at:Date.now(),...o}}});}
 catch(e){return failed(s,command,e);}
}
// The pod the words mean: an exact name, a deployment's pod (a crashing one first), a name part.
async function pickPod(s,command){
 const t=await cluster(s).target();
 const pods=await cluster(s).pods(t);remember({pods});
 const words=wanted(command);
 const rank=p=>p.problem==='bad'?0:p.problem==='warn'?1:2;
 for(const test of [(p,w)=>p.name===w,(p,w)=>p.app===w||p.owner.name===w,(p,w)=>p.name.startsWith(w+'-'),(p,w)=>p.name.includes(w)]){
  // One pod, or one pod of the workload that is in a worse state than the rest (the crashing replica).
  for(const w of words){const found=pods.filter(p=>test(p,w)).sort((a,b)=>rank(a)-rank(b));if(found.length===1||found.length>1&&rank(found[0])<rank(found[1]))return found[0];
   if(found.length>1)return ask({text:'Под «'+w+'» подходит несколько подов. Какой?',label:'Под',options:found.slice(0,6).map(p=>p.name)},answer=>podTurn(s,'опиши под '+String(answer).trim()));}
 }
 const bad=pods.filter(p=>p.problem!=='ok');
 const options=(bad.length?bad:pods).slice(0,6).map(p=>p.name);
 if(!options.length)return kit.reply(s,command,{by:BY,text:'В '+t.namespace+' подов нет.'});
 return ask({text:(words.length?'Под «'+words[0]+'» не нашёл. ':'')+'Какой под посмотреть?',label:'Под',options},answer=>podTurn(s,'опиши под '+String(answer).trim()));
}
const EXPLAIN={type:'object',additionalProperties:false,properties:{cause:{type:'string'},explanation:{type:'string'},evidence:{type:'array',items:{type:'string'},maxItems:4},steps:{type:'array',items:{type:'string'},maxItems:4}},required:['cause','explanation','evidence','steps']};
function podFacts(p){
 const out=[];
 out.push('фаза '+p.phase+(p.reason&&p.reason!==p.phase?', '+p.reason:''));
 out.push('готово '+p.ready);
 if(p.restarts)out.push('перезапусков '+p.restarts);
 for(const c of p.containers){
  if(c.lastReason)out.push(c.name+': прошлый запуск — '+c.lastReason+(c.lastExit!=null?' (код '+c.lastExit+')':''));
  if(c.lastReason==='OOMKilled'&&c.limits.memory)out.push(c.name+': лимит памяти '+c.limits.memory);
 }
 return out;
}
async function podTurn(s,command){
 try{
  const picked=await pickPod(s,command);
  if(picked?.handled)return picked;
  s.requestProgress?.report?.('Смотрю под '+picked.name);
  const d=await cluster(s).podDetail(picked.name);
  const facts=podFacts(d.pod);
  let explained=null;
  if(s.settings.model&&d.pod.problem!=='ok'){
   s.requestProgress?.report?.('Объясняю причину по фактам');
   explained=await kit.modelJSON(s,{system:'Ты помогаешь понять, почему под Kubernetes падает, перезапускается или не готов. Опирайся только на факты из данных: причины состояний контейнеров, коды выхода, OOMKilled и лимиты памяти, события пода и последние строки логов. Не выдумывай причин, которых нет в данных; если фактов мало — так и скажи. cause — причина одной фразой, explanation — 2–3 предложения, evidence — дословные фрагменты событий или строк логов, steps — что проверить. По-русски.',
    user:{pod:d.pod.name,phase:d.pod.phase,reason:d.pod.reason,containers:d.pod.containers,events:d.events.slice(0,12).map(e=>e.type+' '+e.reason+': '+e.message),lastLogLines:d.logs.slice(-40).map(l=>l.text),previousContainer:d.previous},schema:EXPLAIN,predict:900}).catch(()=>null);
   if(explained){
    const all=[...d.events.map(e=>e.message),...d.logs.map(l=>l.text)].join('\n');
    explained={cause:String(explained.cause||'').slice(0,300),explanation:String(explained.explanation||'').slice(0,900),evidence:(explained.evidence||[]).map(v=>String(v).trim()).filter(q=>q.length>3&&all.includes(q)).slice(0,4),steps:(explained.steps||[]).map(v=>String(v).slice(0,240)).slice(0,4)};
   }
  }
  const p=d.pod;
  const fallback=p.oomKilled?'Контейнер убит за превышение лимита памяти (OOMKilled).':K8S_REASON[p.reason]||(p.problem==='ok'?'Под работает, перезапусков нет.':'Явной причины в данных кластера нет.');
  const cause=explained?.cause||fallback;
  const text=p.name+': '+cause.replace(/\.$/,'')+'. Факты: '+facts.join('; ')+'.'+(explained?.explanation?' '+explained.explanation:'');
  return kit.reply(s,command,{by:BY,text,data:{kubernetes:{mode:'pod',at:Date.now(),context:d.context,namespace:d.namespace,pod:p,events:d.events,logs:d.logs.slice(-40),previous:d.previous,describe:d.describe.slice(-3000),facts,cause,explanation:explained?.explanation||'',evidence:explained?.evidence||[],steps:explained?.steps||[],explainedBy:explained?'model':'code'}}});
 }catch(e){return failed(s,command,e);}
}
const K8S_REASON={CrashLoopBackOff:'Контейнер раз за разом завершается с ошибкой, и Kubernetes перезапускает его с растущей паузой (CrashLoopBackOff).',ImagePullBackOff:'Kubernetes не может скачать образ контейнера (ImagePullBackOff): проверьте имя, тег и доступ к реестру.',ErrImagePull:'Kubernetes не может скачать образ контейнера (ErrImagePull).',CreateContainerConfigError:'Контейнер не создаётся из-за конфигурации: чаще всего нет нужного Secret или ConfigMap.',Pending:'Под ждёт размещения: проверьте события — не хватает ресурсов узлов или том не подключается.',Evicted:'Под вытеснен с узла (Evicted), обычно из-за нехватки памяти или диска на узле.'};

async function pickDeployment(s,command,then){
 const t=await cluster(s).target();
 const list=await cluster(s).deployments(t);remember({deployments:list});
 const words=wanted(command);
 const d=list.find(x=>words.includes(x.name))||list.find(x=>words.some(w=>x.name.startsWith(w+'-')||x.name.endsWith('-'+w)))||list.find(x=>words.some(w=>x.name.includes(w)));
 if(d)return {t,d};
 if(!list.length)return kit.reply(s,command,{by:BY,text:'В '+t.namespace+' нет деплойментов.'});
 return ask({text:(words.length?'Деплоймент «'+words[0]+'» не нашёл. ':'')+'Какой деплоймент?',label:'Деплоймент',options:list.slice(0,6).map(x=>x.name)},answer=>then(String(answer).trim()));
}
async function rolloutTurn(s,command){
 try{
  const picked=await pickDeployment(s,command,name=>rolloutTurn(s,'статус выкатки '+name));
  if(picked?.handled)return picked;
  s.requestProgress?.report?.('Смотрю выкатку '+picked.d.name);
  const r=await cluster(s).rollout(picked.d.name);
  const d=r.deployment;
  const word={complete:'выкатка завершена',progressing:'выкатка идёт — '+d.note,failed:'выкатка не удалась — '+d.note,'scaled-down':'реплик 0, деплоймент остановлен'}[d.status];
  const text=d.name+': '+word+'. Готово '+d.ready+' из '+d.replicas+(d.revision?', ревизия '+d.revision:'')+(d.images.length?', образ '+d.images[0]:'')+'.';
  return kit.reply(s,command,{by:BY,text,data:{kubernetes:{mode:'rollout',at:Date.now(),context:r.context,namespace:r.namespace,deployment:d,statusText:r.statusText,pods:r.pods,events:r.events}}});
 }catch(e){return failed(s,command,e);}
}
// «перезапусти деплоймент api», «отскейль api до 3»: nothing runs from the chat; the card shows the command.
async function actionTurn(s,command,verb){
 try{
  const picked=await pickDeployment(s,command,name=>actionTurn(s,command+' '+name,verb));
  if(picked?.handled)return picked;
  const {t,d}=picked;
  let replicas=null;
  if(verb==='scale'){
   replicas=replicasOf(command);
   if(replicas===null)return ask({text:'Сколько реплик оставить у '+d.name+'? Сейчас '+d.replicas+'.',label:'Реплик',options:[...new Set([1,2,3,5,d.replicas+1].filter(n=>n!==d.replicas))].slice(0,4).map(String),placeholder:'число от 0 до 100'},answer=>actionTurn(s,command+' до '+String(answer).replace(/\D/g,''),'scale'));
   if(replicas>100)return kit.reply(s,command,{by:BY,question:true,text:'Больше 100 реплик Петя не ставит. Укажите число от 0 до 100.'});
  }
  const action={verb,name:d.name,namespace:t.namespace,context:t.context,...(verb==='scale'?{replicas}:{})};
  const cmd=K.command(action);
  const what=verb==='restart'?'Перезапустить деплоймент '+d.name+'?':'Поставить '+d.name+' '+replicas+' '+kit.plural(replicas,['реплику','реплики','реплик'])+' (сейчас '+d.replicas+')?';
  return kit.reply(s,command,{by:BY,text:what+' Выполнится: '+cmd+'. Подтвердите в карточке — без нажатия ничего не делаю.',
   data:{kubernetes:{mode:'confirm',at:Date.now(),context:t.context,namespace:t.namespace,deployment:d,pending:{...action,command:cmd,current:d.replicas}}}});
 }catch(e){return failed(s,command,e);}
}

async function turn(s,command){
 const text=String(command||'');
 const k=kind(text);
 if(!k||!kit.installed(s,ID))return null;
 if(k==='overview'||k==='events')return overviewTurn(s,text,k==='events'?'events':'pods');
 if(k==='pod')return podTurn(s,text);
 if(k==='rollout')return rolloutTurn(s,text);
 return actionTurn(s,text,k);
}

// --- Card and settings calls -------------------------------------------------------------------------------------
async function apply(s,pending){
 if(state.busy)throw Error('Kubernetes уже выполняет: '+state.busy+'. Дождитесь окончания.');
 const verb=pending?.verb;
 const action={verb,name:String(pending?.name||''),namespace:String(pending?.namespace||''),context:String(pending?.context||''),...(verb==='scale'?{replicas:Number(pending?.replicas)}:{})};
 const cmd=K.command(action);
 // The scope may have changed since the card was shown: the same context and namespace, the deployment still there.
 const t=await cluster(s).target();
 if(t.context!==action.context||t.namespace!==action.namespace)throw Error('Контекст или пространство имён изменились ('+t.context+', '+t.namespace+'). Попросите заново — команда покажется для нового контекста.');
 const list=await cluster(s).deployments(t);
 if(!list.some(d=>d.name===action.name))throw Error('Деплоймента '+action.name+' больше нет в '+t.namespace+'.');
 const label=verb==='restart'?'Перезапускаю '+action.name:'Масштабирую '+action.name+' до '+action.replicas;
 const id=Date.now().toString(36);
 state.busy=label;publish(s,{text:label+'…',busy:true,kind:'info',version:'running:'+id});
 try{
  await runtime.deps.kubectl.write(action);
  const after=(await cluster(s).deployments(t)).find(d=>d.name===action.name)||null;
  const notice=action.name+': '+(verb==='restart'?'перезапуск начат':'реплик '+action.replicas)+(after?' · готово '+after.ready+' из '+after.replicas:'');
  publish(s,{text:notice,busy:false,kind:'success',version:'done:'+id});
  return {command:cmd,deployment:after,text:notice};
 }catch(e){const m=problem(e);publish(s,{text:label+': '+m,busy:false,kind:'error',version:'error:'+id});throw Error(m);}
 finally{state.busy=null;}
}
async function status(s){
 const k=runtime.cluster(s).kubectl;
 const file=k.binary();
 if(!file)return {installed:false,text:'kubectl не найден. '+INSTALL};
 let contexts=[];try{contexts=await runtime.cluster(s).contexts();}catch{contexts=[];}
 try{const t=await runtime.cluster(s).target();return {installed:true,binary:file,contexts,...t,text:'Контекст '+t.context+', пространство имён '+t.namespace+'.'};}
 catch(e){return {installed:true,binary:file,contexts,text:problem(e)};}
}
function validate(next){
 if(next.kubernetesContext!==undefined){const v=String(next.kubernetesContext||'').trim();if(v&&!K.CONTEXT.test(v))throw Error('Недопустимое имя контекста.');next.kubernetesContext=v;}
 if(next.kubernetesNamespace!==undefined){const v=String(next.kubernetesNamespace||'').trim();if(v&&!K.NAME.test(v))throw Error('Пространство имён — строчные латинские буквы, цифры и «-».');next.kubernetesNamespace=v;}
 if(next.kubernetesKubectl!==undefined){const v=String(next.kubernetesKubectl||'').trim();if(v&&(!require('node:path').isAbsolute(v)||!/kubectl(?:\.exe)?$/i.test(v)))throw Error('Путь к kubectl должен быть полным и заканчиваться на kubectl.');next.kubernetesKubectl=v;}
}
function setup(s){
 runtime.cluster(s);
 return {ipc:{
  progress:()=>state.operation,
  status:()=>status(s),
  async overview(){try{const o=await cluster(s).overview();remember(o);return {mode:'overview',focus:'pods',at:Date.now(),...o};}catch(e){throw Error(problem(e));}},
  // Called only from the confirming button the user pressed in the card.
  apply:pending=>apply(s,pending)
 }};
}
module.exports={name:'kubernetesApp',defaults:{['extension_'+ID]:'false',kubernetesContext:'',kubernetesNamespace:'',kubernetesKubectl:''},validate,setup,turn,kind,wanted,replicasOf,overviewText,apply,state,problem};
