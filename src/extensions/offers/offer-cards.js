// Offers renderer: «Подключить «Крэши»?» under Petya's answer or as the answer to a direct request.
// Accepting adds the extension (and opens its settings when a service has to be connected); the saved request
// is sent again when it can run. «Не сейчас» hides the card, «Не предлагать» mutes that extension.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('offer-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('extensionOffers',method,...args);
 window.renderExtensionOffer=async(parent,offer)=>{
  const k=window.resultKit;if(!k||!offer?.items?.length||parent.querySelector('.offer-card'))return;
  let installed=[];try{installed=(await window.petya.feature('extensionUI','catalog')).filter(e=>e.installed).map(e=>e.id);}catch{installed=[];}
  const body=k.el('div','offer-body');
  const list=k.el('ul','offer-list');
  const sentence=text=>String(text||'').charAt(0).toUpperCase()+String(text||'').slice(1)+(/[.!?]$/.test(text)?'':'.');
  // One extension: its name is in the header, the body says what it will do. Several: name and what each does.
  if(offer.items.length===1)body.append(k.el('p','offer-pitch',sentence(offer.items[0].pitch)));
  else{for(const item of offer.items){const li=k.el('li','offer-item');li.append(k.el('b',null,item.name),k.el('span',null,sentence(item.pitch)));list.append(li);}body.append(list);}
  const done=offer.items.filter(i=>installed.includes(i.ext));
  const finish=text=>{card.querySelector('.kit-actions')?.remove();body.append(k.el('p','offer-done',text));};
  const actions=[];
  if(done.length)body.append(k.el('p','offer-done','Добавлено: '+done.map(i=>'«'+i.name+'»').join(', ')+'.'));
  else{
   for(const item of offer.items)actions.push({label:offer.items.length>1?'Подключить «'+item.name+'»':'Подключить',primary:true,run:async()=>{
    const r=await call('accept',item.id);
    if(r.settings){finish(r.text);await window.extensionHost?.open(r.settings);
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
 };
})();
