// «API-клиент», renderer: the request card (method, URL, headers with masked secrets, body), the confirmation for a
// request that waits for «Отправить», and the response: status chip with timing, a waiting/download timing bar,
// collapsible headers, a JSON tree with search, an image preview or text, «Скопировать как curl», «Повторить» and
// «Сохранить в окружение». The OpenAPI card lists endpoints by tag with a method mix bar and puts a chosen one
// into the composer. Response content is never HTML: text only, images through <img> from a data: URL.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('http-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('httpClient',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const U=unit=>' '+(/^ru/i.test(locale())?unit:({МБ:'MB',КБ:'KB',Б:'B',мс:'ms'}[unit]||unit));
 const size=n=>{n=Number(n)||0;return n>=1e6?(n/1e6).toLocaleString(locale(),{maximumFractionDigits:1})+U('МБ'):n>=1e3?(n/1e3).toLocaleString(locale(),{maximumFractionDigits:1})+U('КБ'):n+U('Б');};
 const msText=n=>Math.round(Number(n)||0).toLocaleString(locale())+U('мс');
 const raw=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 const btn=(k,cls,label,run)=>{const b=k.el('button',cls,label);b.type='button';b.onclick=run;return b;};
 const copy=async(k,text,done='Скопировано')=>{try{await navigator.clipboard.writeText(text);k.toast(done);}catch{k.toast('Не удалось скопировать',{error:true});}};
 const methodChip=(k,m)=>raw(k,'span','hc-method m-'+String(m).toLowerCase(),m);
 const toneOf=status=>status>=500?'alert':status>=400?'progress':status>=300?'accent':'done';

 // --- Request -------------------------------------------------------------------------------------------------
 function requestBox(k,req,{open}){
  const box=k.el('details','hc-request');if(open)box.open=true;
  const sum=k.el('summary','hc-request-head');
  sum.append(k.el('span','hc-section-label','Запрос'),methodChip(k,req.method),raw(k,'span','hc-url',req.url));
  if(req.env)sum.append(k.el('span','hc-env','окружение '),raw(k,'span','hc-env-name',req.env.name));
  box.append(sum);
  if(req.headers.length){
   const list=k.el('div','hc-headers');
   for(const h of req.headers){const row=k.el('div','hc-header'+(h.secret?' secret':''));row.append(raw(k,'span','hc-hname',h.name),raw(k,'span','hc-hvalue',h.value));
    if(h.secret)row.append(k.el('span','hc-tag','секрет'));else if(h.source==='env')row.append(k.el('span','hc-tag muted','из окружения'));list.append(row);}
   box.append(list);
  }
  if(req.body){let text=req.body;try{text=JSON.stringify(JSON.parse(text),null,2);}catch{/* as typed */}box.append(raw(k,'pre','hc-pre hc-req-body',text+(req.bodyCut?'\n…':'')));}
  return box;
 }

 // --- JSON tree ---------------------------------------------------------------------------------------------------
 const typeOf=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
 function prim(k,v){const t=typeOf(v);return raw(k,'span','hc-v t-'+t,t==='string'?JSON.stringify(v):String(v));}
 function preview(v){const t=typeOf(v);return t==='array'?'['+v.length+']':'{'+Object.keys(v).length+'}';}
 function tree(k,key,value,depth){
  const t=typeOf(value);
  const label=key===null?null:raw(k,'span','hc-k',Array.isArray(key)?key[0]:key);
  if(t!=='object'&&t!=='array'){const row=k.el('div','hc-leaf');if(label)row.append(label,k.el('span','hc-colon',': '));row.append(prim(k,value));return row;}
  const box=k.el('details','hc-node');
  const sum=k.el('summary');if(label)sum.append(label,k.el('span','hc-colon',': '));sum.append(raw(k,'span','hc-count',preview(value)));
  box.append(sum);
  const fill=()=>{if(box.dataset.filled)return;box.dataset.filled='1';const kids=k.el('div','hc-kids');
   const entries=t==='array'?value.map((v,i)=>[[i],v]):Object.entries(value);
   for(const [kk,vv] of entries.slice(0,500))kids.append(tree(k,kk,vv,depth+1));
   if(entries.length>500)kids.append(k.el('div','hc-more','Ещё элементов: '+(entries.length-500)));
   box.append(kids);};
  box.addEventListener('toggle',()=>{if(box.open)fill();});
  if(depth<2&&(t==='array'?value.length:Object.keys(value).length)<=40){box.open=true;fill();}
  return box;
 }
 // Search: every key or value containing the text, as a list of paths.
 function search(data,needle,limit=150){
  const out=[],n=needle.toLowerCase();
  const walk=(v,p)=>{if(out.length>=limit)return;const t=typeOf(v);
   if(t==='object'||t==='array'){for(const [kk,vv] of (t==='array'?v.map((x,i)=>[i,x]):Object.entries(v))){const next=t==='array'?p+'['+kk+']':p+(p?'.':'')+kk;if(String(kk).toLowerCase().includes(n)&&t!=='array')out.push({path:next,value:vv});else if(typeOf(vv)!=='object'&&typeOf(vv)!=='array'&&String(vv).toLowerCase().includes(n))out.push({path:next,value:vv});walk(vv,next);}}};
  walk(data,'');return out;
 }
 function mark(k,text,needle){const box=raw(k,'span');const low=text.toLowerCase(),n=needle.toLowerCase();let at=0,i;while(n&&(i=low.indexOf(n,at))>=0){box.append(text.slice(at,i),k.el('mark',null,text.slice(i,i+n.length)));at=i+n.length;}box.append(text.slice(at));return box;}
 function jsonView(k,text){
  let data;try{data=JSON.parse(text);}catch{return raw(k,'pre','hc-pre',text);}
  const wrap=k.el('div','hc-json');
  const bar=k.el('div','hc-json-bar');
  const input=k.el('input','hc-search');input.type='search';input.placeholder='Найти в ответе';input.setAttribute('aria-label','Найти в ответе');
  const modes=k.el('div','hc-switch');modes.setAttribute('role','group');modes.setAttribute('aria-label','Вид ответа');
  let mode='tree';
  const area=k.el('div','hc-json-area');
  const hits=k.el('span','hc-muted');
  const paint=()=>{
   for(const b of modes.children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
   const q=input.value.trim();
   if(q){const found=search(data,q);hits.textContent='Совпадений: '+found.length+(found.length>=150?'+':'');
    const list=k.el('div','hc-found');for(const f of found){const row=k.el('div','hc-found-row');row.append(mark(k,f.path,q),k.el('span','hc-colon',' = '),typeOf(f.value)==='object'||typeOf(f.value)==='array'?raw(k,'span','hc-count',preview(f.value)):mark(k,typeOf(f.value)==='string'?JSON.stringify(f.value):String(f.value),q));list.append(row);}
    if(!found.length)list.append(k.el('div','hc-muted','Ничего не найдено'));area.replaceChildren(list);return;}
   hits.textContent='';
   // The root object or array is not a node of its own: its members are the first level.
   const root=()=>{const t=typeOf(data);if(t!=='object'&&t!=='array')return tree(k,null,data,0);const box=k.el('div','hc-root');const entries=t==='array'?data.map((v,i)=>[[i],v]):Object.entries(data);
    for(const [kk,vv] of entries.slice(0,500))box.append(tree(k,kk,vv,1));if(entries.length>500)box.append(k.el('div','hc-more','Ещё элементов: '+(entries.length-500)));if(!entries.length)box.append(raw(k,'span','hc-count',t==='array'?'[]':'{}'));return box;};
   area.replaceChildren(mode==='tree'?root():raw(k,'pre','hc-pre',JSON.stringify(data,null,2)));
  };
  for(const [id,label] of [['tree','Дерево'],['text','Текст']]){const b=btn(k,'hc-mode',label,()=>{mode=id;paint();});b.dataset.mode=id;modes.append(b);}
  const copyBtn=btn(k,'hc-mode','Копировать JSON',()=>copy(k,JSON.stringify(data,null,2)));
  input.oninput=paint;
  bar.append(input,modes,copyBtn,hits);wrap.append(bar,area);paint();
  return wrap;
 }
 function bodyView(k,v){
  if(!v||v.kind==='empty')return k.el('p','hc-muted','Пустое тело ответа.');
  if(v.kind==='json'&&v.text)return jsonView(k,v.text);
  if(v.kind==='json')return raw(k,'pre','hc-pre',(v.preview||'')+'\n…');
  if(v.kind==='image'){const box=k.el('div','hc-image');const img=k.el('img');img.alt='Изображение из ответа';img.src=/^data:image\//.test(v.dataUrl)?v.dataUrl:'';const note=k.el('span','hc-muted',v.contentType);img.onload=()=>{if(img.naturalWidth&&img.naturalWidth<64){img.style.width=Math.min(128,img.naturalWidth*4)+'px';img.style.imageRendering='pixelated';}note.textContent=v.contentType.split(';')[0]+' · '+img.naturalWidth+'×'+img.naturalHeight+' · '+size(v.size);};box.append(img,note);return box;}
  if(v.kind==='binary')return k.el('p','hc-muted','Двоичные данные ('+(v.contentType||'без типа')+'), '+size(v.size)+'. Показывать нечего.');
  const pre=raw(k,'pre','hc-pre',v.text+(v.cut?'\n…':''));
  if(v.kind==='html'){const box=k.el('div');box.append(k.el('p','hc-muted','HTML показан как текст.'),pre);return box;}
  return pre;
 }
 // Waiting for the first byte vs downloading the rest, against the whole time.
 function timing(k,r){
  const box=k.el('div','hc-timing');
  const total=Math.max(1,r.timing.total),wait=Math.min(total,r.timing.ttfb||0);
  const bar=k.el('div','hc-timing-bar');bar.setAttribute('role','img');bar.setAttribute('aria-label','Ожидание ответа '+msText(wait)+', загрузка '+msText(total-wait));
  const a=k.el('span','hc-seg wait');a.style.flexGrow=String(wait/total);const b=k.el('span','hc-seg load');b.style.flexGrow=String((total-wait)/total);bar.append(a,b);
  const legend=k.el('div','hc-timing-legend');
  legend.append(k.el('span','hc-dot wait'),k.el('span',null,'ожидание '+msText(wait)),k.el('span','hc-dot load'),k.el('span',null,'загрузка '+msText(total-wait)),k.el('span','hc-muted','· '+size(r.size)+(r.wire&&r.wire!==r.size?' (по сети '+size(r.wire)+')':'')));
  box.append(bar,legend);return box;
 }

 function saveForm(k,d,host){
  const form=k.el('div','hc-save');
  const input=k.el('input');input.type='text';input.placeholder='Название окружения';input.value=host;input.setAttribute('aria-label','Название окружения');
  const go=btn(k,'primary','Сохранить',async()=>{go.disabled=true;try{const r=await call('saveEnvironment',d.id,input.value);k.toast('Окружение «'+r.name+'» сохранено'+(r.secrets?' · секретов: '+r.secrets:''));form.remove();}catch(e){k.toast(e.message,{error:true});go.disabled=false;}});
  form.append(k.el('span','hc-muted','Базовый адрес и заголовки этого запроса станут окружением; секретные заголовки сохранятся как секреты.'),input,go,btn(k,null,'Отмена',()=>form.remove()));
  return form;
 }
 function confirmBox(k,d,{label='Отправить',run}){
  const box=k.el('div','hc-confirm');box.setAttribute('role','group');box.setAttribute('aria-label','Подтверждение запроса');
  box.append(k.el('p','hc-confirm-title','Отправить этот запрос?'));
  if(d.reasons?.length){const ul=k.el('ul','hc-reasons');for(const r of d.reasons)ul.append(raw(k,'li',null,r));box.append(ul);}
  const go=btn(k,'primary',label),cancel=btn(k,null,'Отмена');
  go.onclick=async()=>{go.disabled=cancel.disabled=true;go.setAttribute('aria-busy','true');try{await run();}catch(e){go.disabled=cancel.disabled=false;k.toast(e.message,{error:true});}finally{go.removeAttribute('aria-busy');}};
  cancel.onclick=async()=>{box.remove();call('cancel',d.id).catch(()=>{});};
  const bar=k.el('div','hc-confirm-actions');bar.append(go,cancel);box.append(bar);
  return box;
 }

 // An expired request (restart, an hour) is offered again through the chat, where the usual checks apply.
 const expired=(k,d,result)=>k.toast(result.message,{error:true,action:{label:'Повторить в чате',run:()=>k.ask(d.command,{send:true})}});
 function render(k,d){
  const body=k.el('div','hc-body');
  const r=d.response;
  let card;
  const replace=next=>{if(next?.expired)return expired(k,d,next);if(next?.confirm)return askAgain(next);const fresh=render(k,next);card.replaceWith(fresh);};
  const askAgain=next=>{if(card.querySelector('.hc-confirm'))return;body.append(confirmBox(k,{...d,reasons:[next.message]},{label:'Отправить ещё раз',run:async()=>replace(await call('repeat',d.id,{confirmed:true}))}));};
  if(d.mode==='confirm'){
   body.append(requestBox(k,d.request,{open:true}));
   body.append(confirmBox(k,d,{run:async()=>replace(await call('send',d.id))}));
  }else{
   body.append(requestBox(k,d.request,{open:d.mode==='error'}));
   if(d.mode==='error'){body.append(raw(k,'p','hc-error',d.error.message));}
   else{
    body.append(timing(k,r));
    if(r.redirects?.length){const ul=k.el('div','hc-redirects');for(const h of r.redirects){const row=k.el('div','hc-redirect');row.append(raw(k,'span','hc-code',String(h.status)),raw(k,'span','hc-url',h.to));ul.append(row);}body.append(ul);}
    if(r.stoppedRedirect)body.append(raw(k,'p','hc-note','Перенаправление на '+r.stoppedRedirect+' не выполнено: запрос '+d.request.method+' не повторяется автоматически.'));
    if(r.truncated)body.append(k.el('p','hc-note','Ответ больше '+size(d.limits.maxBytes)+' — показано начало.'));
    const headers=k.el('details','hc-resp-headers');headers.append(k.el('summary',null,'Заголовки ответа · '+r.headers.length));
    const list=k.el('div','hc-headers');for(const h of r.headers){const row=k.el('div','hc-header');row.append(raw(k,'span','hc-hname',h.name),raw(k,'span','hc-hvalue',h.value));list.append(row);}
    headers.append(list);body.append(headers,bodyView(k,r.view));
   }
  }
  const status=d.mode==='confirm'?{label:'ждёт подтверждения',tone:'progress'}:d.mode==='error'?{label:'нет ответа',tone:'alert',title:d.error.message}:{label:r.status+(r.statusText?' '+r.statusText:'')+' · '+msText(r.timing.total),tone:toneOf(r.status)};
  const actions=[];
  if(d.mode!=='confirm'){
   actions.push({label:'Повторить',run:async()=>{
    const safe=['GET','HEAD'].includes(d.request.method);
    if(!safe){if(card.querySelector('.hc-confirm'))return;body.append(confirmBox(k,{...d,reasons:['метод '+d.request.method+' может изменить данные']},{label:'Отправить ещё раз',run:async()=>replace(await call('repeat',d.id,{confirmed:true}))}));return;}
    replace(await call('repeat',d.id));
   }});
  }
  actions.push({label:'Скопировать как curl',run:()=>copy(k,d.curl,'curl скопирован: секреты заменены переменными окружения')});
  if(!d.request.env&&d.mode==='response'){let host='';try{host=new URL(d.request.url).host;}catch{}actions.push({label:'Сохранить в окружение',run:()=>{if(!card.querySelector('.hc-save'))body.append(saveForm(k,d,host));}});}
  if(r&&r.status>=500)actions.push(k.links('task-tracker',{title:d.request.method+' '+d.request.url+' отвечает '+r.status,description:'Запрос '+d.request.method+' '+d.request.url+' вернул '+r.status+' '+(r.statusText||'')+' за '+r.timing.total+' мс.',type:'bug'}));
  const key=k.el('span','hc-key');key.append(methodChip(k,d.request.method),raw(k,'span','hc-url',d.request.url));
  card=k.card({app:'API-клиент',initial:'⇄',color:'#3d5a7a',status,body,actions,className:'hc-card',subtitle:d.at?new Date(d.at).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''});
  card.querySelector('.kit-card-head')?.insertBefore(key,card.querySelector('.kit-card-head .kit-chip'));
  return card;
 }
 window.renderHttpRequest=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.hc-card'))return;
  parent.append(render(k,d));
 };

 // --- OpenAPI -----------------------------------------------------------------------------------------------------
 const ORDER=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
 window.renderHttpOpenapi=(parent,o)=>{
  const k=window.resultKit;if(!k||!o||parent.querySelector('.hc-openapi'))return;
  const body=k.el('div','hc-body');
  // Method mix: how many endpoints of each kind.
  const counts=ORDER.map(m=>[m,o.endpoints.filter(e=>e.method===m).length]).filter(([,n])=>n);
  const mix=k.el('div','hc-mix');mix.setAttribute('role','img');mix.setAttribute('aria-label',counts.map(([m,n])=>m+' '+n).join(', '));
  for(const [m,n] of counts){const seg=k.el('span','hc-mix-seg m-'+m.toLowerCase());seg.style.flexGrow=String(n);seg.title=m+': '+n;mix.append(seg);}
  const legend=k.el('div','hc-mix-legend');for(const [m,n] of counts){const item=k.el('span','hc-mix-item');item.append(methodChip(k,m),k.el('span',null,String(n)));legend.append(item);}
  body.append(mix,legend);
  let server=o.servers[0]||'';
  if(o.servers.length){
   const row=k.el('div','hc-servers');row.append(k.el('span','hc-muted','Сервер:'));
   o.servers.forEach((url,i)=>{const b=raw(k,'button','hc-server'+(i?'':' on'),url);b.type='button';b.setAttribute('aria-pressed',String(!i));if(o.known?.[i])b.title='Окружение «'+o.known[i]+'»';
    b.onclick=()=>{server=url;for(const x of row.querySelectorAll('.hc-server')){x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));}};
    row.append(b);if(o.known?.[i])row.append(k.el('span','hc-tag muted','окружение '+o.known[i]));});
   body.append(row);
  }
  const input=k.el('input','hc-search');input.type='search';input.placeholder='Найти эндпоинт';input.setAttribute('aria-label','Найти эндпоинт');
  const list=k.el('div','hc-endpoints');
  const paint=()=>{
   const q=input.value.trim().toLowerCase();list.replaceChildren();
   const shown=o.endpoints.filter(e=>!q||(e.method+' '+e.path+' '+e.summary+' '+e.tag).toLowerCase().includes(q));
   const tags=[...new Set(shown.map(e=>e.tag||''))];
   for(const tag of tags){
    if(tags.length>1||tag)list.append(raw(k,'div','hc-tagname',tag||'—'));
    for(const e of shown.filter(x=>(x.tag||'')===tag).slice(0,200)){
     const row=k.el('button','hc-endpoint'+(e.deprecated?' deprecated':''));row.type='button';
     row.append(methodChip(k,e.method),raw(k,'span','hc-path',e.path),raw(k,'span','hc-summary',e.summary));
     row.title='Подставить запрос в поле ввода';
     row.onclick=()=>k.ask('дерни '+e.method+' '+(server?server.replace(/\/$/,''):'')+e.path);
     list.append(row);
    }
   }
   if(!shown.length)list.append(k.el('p','hc-muted','Ничего не найдено'));
  };
  input.oninput=paint;paint();
  body.append(input,list);
  parent.append(k.card({app:'API-клиент',initial:'⇄',color:'#3d5a7a',key:o.title+(o.version?' '+o.version:''),status:{label:'эндпоинтов: '+o.total,tone:'accent'},subtitle:o.spec,body,className:'hc-card hc-openapi',
   meta:[o.file,'запрос подставляется в поле ввода — проверьте параметры перед отправкой']}));
 };
})();
