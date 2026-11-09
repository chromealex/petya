// Offers renderer: «Подключить «Крэши»?» under Petya's answer or as the answer to a direct request.
// Accepting adds the extension (and opens its settings when a service has to be connected); the saved request
// is sent again when it can run. «Не сейчас» hides the card, «Не предлагать» mutes that extension.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('offer-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('extensionOffers',method,...args);
 window.renderExtensionOffer=async(parent,offer)=>{
  const k=window.resultKit;if(!k||!offer?.items?.length||parent.querySelector('.offer-card'))return;
  // Added and, for apps with a connection, connected. A service-connected app (Google Play) is never «added» here:
  // its directory is always present, the connection is what is missing.
  let installed=[];try{installed=(await window.petya.feature('extensionUI','catalog')).filter(e=>e.installed&&e.connected!==false).map(e=>e.id);}catch{installed=[];}
  const body=k.el('div','offer-body');
  const list=k.el('ul','offer-list');
  const sentence=raw=>{const text=window.t?window.t(String(raw||'')):String(raw||'');return text.charAt(0).toUpperCase()+String(text||'').slice(1)+(/[.!?]$/.test(text)?'':'.');};
  // One extension: its name is in the header, the body says what it will do. Several: name and what each does.
  if(offer.items.length===1)body.append(k.el('p','offer-pitch',sentence(offer.items[0].pitch)));
  else{for(const item of offer.items){const li=k.el('li','offer-item');li.append(k.el('b',null,item.name),k.el('span',null,sentence(item.pitch)));list.append(li);}body.append(list);}
  const done=offer.items.filter(i=>!i.service&&installed.includes(i.ext));
  const finish=text=>{card.querySelector('.kit-actions')?.remove();body.append(k.el('p','offer-done',text));};
  const actions=[];
  if(done.length)body.append(k.el('p','offer-done','Добавлено: '+done.map(i=>'«'+i.name+'»').join(', ')+'.'));
  else{
   for(const item of offer.items)actions.push({label:offer.items.length>1?'Подключить «'+item.name+'»':'Подключить',primary:true,run:async()=>{
    const r=await call('accept',item.id);
    // Connected in Petya's own service settings (Google Play): open that card; otherwise the extension's card.
    if(r.settings||r.service){finish(r.text);if(r.service)await window.openChatServiceSettings?.(r.service);else await window.extensionHost?.open(r.settings);
     if(r.retry){const again=k.el('button','primary','Готово — продолжить');again.type='button';again.onclick=()=>k.ask(r.retry,{send:true});body.append(again);}
     return;}
    finish(r.text);if(r.retry)await k.ask(r.retry,{send:true});
   }});
   actions.push({label:'Не сейчас',run:async()=>{for(const item of offer.items)await call('dismiss',item.id,false).catch(()=>{});card.remove();}});
   actions.push({label:'Не предлагать',title:'Больше не предлагать это расширение; добавить его можно в каталоге',run:async()=>{for(const item of offer.items)await call('dismiss',item.id,true).catch(()=>{});finish('Больше не предлагаю.');}});
  }
  const card=k.card({app:'Расширения',initial:'+',color:'#2f6f5e',key:offer.items.length>1?'Подходят расширения':'Расширение «'+offer.items[0].name+'»',
   subtitle:offer.direct?'нужно для ответа':'может помочь',body,actions,className:'offer-card'+(offer.direct?'':' quiet')});
  parent.append(card);
  // What adding takes: each offered app's own files plus the downloads it needs right away.
  if(!done.length)window.petya.feature('extensionUI','sizes').then(r=>{
   const apps=r?.apps||{},num=(n,d)=>n.toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:d});
   const en=!/^ru/i.test(window.petyaLocale||'ru'),u=x=>en?{ГБ:'GB',МБ:'MB',КБ:'KB'}[x]:x;
   const size=n=>n>=1e9?num(n/1e9,1)+' '+u('ГБ'):n>=1e6?num(n/1e6,n<1e7?1:0)+' '+u('МБ'):Math.max(1,Math.round(n/1e3))+' '+u('КБ');
   const rows=offer.items.filter(i=>!i.service&&apps[i.ext]).map(i=>({name:i.name,w:apps[i.ext]}));
   if(!rows.length||!card.isConnected||card.querySelector('.offer-size'))return;
   const total=rows.reduce((a,r)=>a+(r.w.own||0)+(r.w.install||0),0),approx=rows.some(r=>r.w.approx);
   const line=k.el('p','offer-size','Размер при установке: '+(approx?'≈ ':'')+size(total)+(rows.some(r=>r.w.install)?' (с загрузками)':''));
   line.title=rows.map(r=>r.name+': приложение '+size(r.w.own||0)+(r.w.install?', загрузки '+size(r.w.install):'')+(r.w.optional?', по желанию ещё '+size(r.w.optional):'')).join('\n');
   const pitch=body.querySelector('.offer-pitch,.offer-list');(pitch||body.firstChild)?.after(line);
  }).catch(()=>{});
 };
})();
