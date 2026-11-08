// «Отзывы в сторах», renderer: average with its change, rating distribution bars, reviews per day stacked by rating,
// complaint themes with verbatim quotes, and the recent reviews. Each review can get a reply: «Черновик ответа» puts
// the model's draft into an editor in the card, «Отправить ответ» posts exactly the edited text — nothing is sent
// before the user presses it.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('reviews-cards.css',document.currentScript.src).href;document.head.append(style);
 const STORE={appstore:'App Store',play:'Google Play'};
 const COLORS=['#f0b4a8','#f3c79c','#e5ce8c','#cfe39a','#9ed99a'];
 const call=(method,...args)=>window.petya.feature('storeReviews',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const num=v=>v===null||v===undefined?'—':Number(v).toLocaleString(locale(),{minimumFractionDigits:1,maximumFractionDigits:2});
 const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});};
 const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};
 // Service, user and model content (review texts, quotes, themes, app names) is left alone by the UI translator.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const notify=(id,data)=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data}}));

 function starsNode(k,rating){const box=k.el('span','rv-stars');box.setAttribute('aria-label',rating+' из 5');box.style.color=COLORS[Math.max(0,rating-1)];box.append('★'.repeat(rating));box.append(k.el('span','rv-stars-off','★'.repeat(5-rating)));return box;}

 function score(k,d){
  const s=d.summary,box=k.el('div','rv-score');
  box.append(k.el('span','rv-average',num(s.average)));
  if(s.average!==null)box.append(starsNode(k,Math.round(s.average)));
  box.append(k.el('span','rv-count',s.count+' '+plural(s.count,['отзыв','отзыва','отзывов'])));
  if(s.delta!==null){
   const tone=s.delta<=-0.1?'down':s.delta>=0.1?'up':'flat';
   const line=k.el('span','rv-delta '+tone,(s.delta>0?'▲ +':s.delta<0?'▼ −':'± ')+num(Math.abs(s.delta)));
   const against=s.compared==='previousVersion'?'к прошлой версии':'к прошлому периоду';
   line.append(k.el('small',null,' '+against+(Array.isArray(s.compared)&&s.compared.length===1&&d.stores.length>1?' ('+STORE[s.compared[0]]+')':'')));
   line.title='Было: '+num(s.previous.average)+' по '+s.previous.count+' '+plural(s.previous.count,['отзыву','отзывам','отзывам']);
   box.append(line);
  }else if(s.count)box.append(k.el('small','rv-delta flat',d.focus.update?'прошлой версии нет в отзывах':'сравнить не с чем'));
  return box;
 }
 function distribution(k,d){
  const box=k.el('div','rv-dist');box.setAttribute('role','list');box.setAttribute('aria-label','Распределение оценок');
  const values=[5,4,3,2,1].map(n=>d.summary.distribution[n]||0),max=Math.max(1,...values),total=d.summary.count||1;
  [5,4,3,2,1].forEach((n,i)=>{
   const row=k.el('div','rv-dist-row');row.setAttribute('role','listitem');row.setAttribute('aria-label',n+' звёзд: '+values[i]);
   const track=k.el('span','rv-dist-track'),fill=k.el('span','rv-dist-fill');fill.style.width=(100*values[i]/max)+'%';fill.style.background=COLORS[n-1];track.append(fill);
   row.append(k.el('span','rv-dist-label',n+'★'),track,k.el('span','rv-dist-count',values[i]+(d.summary.count?' · '+Math.round(100*values[i]/total)+'%':'')));
   box.append(row);
  });
  return box;
 }
 function timeline(k,d){
  const days=d.timeline||[];if(!days.length)return null;
  const box=k.el('div','rv-timeline');box.append(k.el('div','rv-section',d.focus.update&&d.version?'Отзывы по дням · версия '+d.version:'Отзывы по дням'));
  const max=Math.max(1,...days.map(x=>x.counts.reduce((a,b)=>a+b,0)));
  const plot=k.el('div','rv-plot');plot.setAttribute('role','list');
  const tip=k.el('div','rv-tip','Наведите на день');
  for(const x of days){
   const total=x.counts.reduce((a,b)=>a+b,0);
   const col=k.el('button','rv-col');col.type='button';col.setAttribute('role','listitem');
   const text=day(x.date)+': '+(total?total+' · '+x.counts.map((c,i)=>c?(i+1)+'★ '+c:'').filter(Boolean).join(', '):'нет отзывов');col.setAttribute('aria-label',text);
   const stack=k.el('span','rv-stack');stack.style.height=(100*total/max)+'%';
   for(let i=0;i<5;i++)if(x.counts[i]){const seg=k.el('span','rv-seg');seg.style.flexGrow=String(x.counts[i]);seg.style.background=COLORS[i];stack.append(seg);}
   col.append(stack);
   col.onpointerenter=col.onfocus=()=>{tip.textContent=text;};col.onpointerleave=col.onblur=()=>{tip.textContent='Наведите на день';};
   plot.append(col);
  }
  const axis=k.el('div','rv-axis');axis.append(k.el('span',null,day(days[0].date)));if(days.length>2)axis.append(k.el('span',null,day(days[Math.floor(days.length/2)].date)));axis.append(k.el('span',null,day(days.at(-1).date)));
  const legend=k.el('div','rv-legend');COLORS.forEach((c,i)=>{const item=k.el('span','rv-legend-item');const sw=k.el('i');sw.style.background=c;item.append(sw,(i+1)+'★');legend.append(item);});
  box.append(plot,axis,legend,tip);return box;
 }
 function clusters(k,d){
  const box=k.el('div','rv-clusters');
  box.append(k.el('div','rv-section','О чём жалуются'));
  if(d.clusters===null){box.append(k.el('p','rv-note','Темы жалоб появятся, когда в настройках выбрана локальная модель. Цифры и отзывы ниже — без модели.'));return box;}
  if(!d.clusters.length){box.append(k.el('p','rv-note',d.summary.count?'Повторяющихся жалоб не нашлось.':'Жалоб нет.'));return box;}
  const max=Math.max(...d.clusters.map(c=>c.count));
  for(const c of d.clusters){
   const item=k.el('div','rv-cluster');
   const head=k.el('div','rv-cluster-head');const bar=k.el('span','rv-cluster-bar');const fill=k.el('span');fill.style.width=(100*c.count/max)+'%';bar.append(fill);
   head.append(raw(k.el('span','rv-cluster-title',c.title)),bar,k.el('span','rv-cluster-count',c.count+' '+plural(c.count,['отзыв','отзыва','отзывов'])));
   item.append(head);
   for(const q of c.quotes||[])item.append(raw(k.el('blockquote','rv-quote','«'+q.text+'»')));
   box.append(item);
  }
  return box;
 }

 function editor(k,d,r,item,chips,initial){
  item.querySelector('.kit-draft')?.remove();
  const box=k.el('div','kit-draft rv-editor');
  const label=k.el('label','kit-draft-label',r.store==='play'?'Ответ в Google Play — отправится ровно этот текст':'Ответ в App Store — отправится ровно этот текст');
  const area=raw(k.el('textarea'));area.value=initial||'';area.rows=4;area.setAttribute('aria-label','Текст ответа');
  const counter=k.el('small','rv-counter');const sync=()=>{counter.textContent=area.value.length+' / '+r.limit;counter.classList.toggle('over',area.value.length>r.limit);send.disabled=!area.value.trim()||area.value.length>r.limit;};
  const row=k.el('div','kit-actions');
  const send=k.el('button','primary','Отправить ответ');send.type='button';
  const cancel=k.el('button',null,'Отмена');cancel.type='button';cancel.onclick=()=>box.remove();
  send.onclick=async()=>{
   const text=area.value;send.disabled=true;area.readOnly=true;send.setAttribute('aria-busy','true');
   const nid='store-reviews-reply:'+r.store+':'+r.id;
   try{
    const result=await call('send',{store:r.store,app:r.app,id:r.id},text);
    r.reply=result.reply;box.remove();chips.querySelector('.rv-replied')?.remove();chips.append(replied(k,r));
    item.querySelector('.rv-own-reply')?.remove();item.querySelector('.rv-text').after(ownReply(k,r));
    k.toast(result.text);notify(nid,{title:'Ответ на отзыв · '+d.app,text:result.text,kind:'success'});
   }catch(e){area.readOnly=false;sync();k.toast(e.message,{error:true});notify(nid,{title:'Ответ на отзыв · '+d.app,text:e.message,kind:'error'});}
   finally{send.removeAttribute('aria-busy');}
  };
  area.oninput=sync;sync();
  row.append(send,cancel,counter);box.append(label,area,row);
  item.append(box);area.focus();return box;
 }
 const replied=(k,r)=>{const c=k.chip({label:r.reply.state==='pending'?'ответ на проверке':'ответ отправлен',tone:r.reply.state==='pending'?'progress':'done',title:r.reply.date?when(r.reply.date):''});c.classList.add('rv-replied');return c;};
 const ownReply=(k,r)=>{const p=k.el('p','rv-own-reply');p.append(k.el('b',null,'Ответ: '),raw(k.el('span',null,r.reply.text)));return p;};

 function review(k,d,r){
  const item=k.el('article','rv-item');item.dataset.review=r.store+':'+r.id;
  const top=k.el('div','rv-item-head');
  top.append(starsNode(k,r.rating));
  const chips=k.el('span','rv-item-chips');
  if(d.stores.length>1)chips.append(k.chip({label:STORE[r.store]}));
  const place=[r.territory,r.language].filter(Boolean).join(' · ');if(place)chips.append(raw(k.chip({label:place,title:r.store==='play'?'Язык устройства (Google Play не сообщает страну)':'Страна App Store'})));
  if(r.version)chips.append(raw(k.chip({label:'v'+r.version})));
  if(r.reply)chips.append(replied(k,r));
  top.append(chips,raw(k.el('span','rv-when',[r.author,when(r.date)].filter(Boolean).join(' · '))));
  item.append(top);
  if(r.title)item.append(raw(k.el('div','rv-title',r.title)));
  const text=r.text?raw(k.el('p','rv-text',r.text)):k.el('p','rv-text','(без текста)');
  item.append(text);
  if((r.text||'').length>220){
   text.classList.add('clamped');
   const more=k.el('button','rv-more','Показать полностью');more.type='button';more.setAttribute('aria-expanded','false');
   more.onclick=()=>{const open=text.classList.toggle('clamped');more.textContent=open?'Показать полностью':'Свернуть';more.setAttribute('aria-expanded',String(!open));};
   item.append(more);
  }
  if(r.reply?.text)item.append(ownReply(k,r));
  const actions=k.el('div','kit-actions rv-item-actions');
  const draft=k.el('button',null,d.model?'Черновик ответа':'Написать ответ');draft.type='button';
  if(r.reply)draft.textContent=d.model?'Новый черновик ответа':'Изменить ответ';
  draft.onclick=async()=>{
   if(!d.model){editor(k,d,r,item,chips,r.reply?.text||'');return;}
   draft.disabled=true;draft.setAttribute('aria-busy','true');const label=draft.textContent;draft.textContent='Составляю…';
   try{const result=await call('draft',{store:r.store,app:r.app,id:r.id});editor(k,d,r,item,chips,result.text);}
   catch(e){k.toast(e.message,{error:true});editor(k,d,r,item,chips,'');}
   finally{draft.disabled=false;draft.removeAttribute('aria-busy');draft.textContent=label;}
  };
  actions.append(draft);item.append(actions);
  return item;
 }

 window.renderStoreReviews=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.reviews-card'))return;
  const body=k.el('div','rv-body');
  const top=k.el('div','rv-top');top.append(score(k,d),distribution(k,d));body.append(top);
  const line=timeline(k,d);if(line)body.append(line);
  if(d.summary.count)body.append(clusters(k,d));
  const list=k.el('div','rv-list');
  const label=d.focus.reply?'Отзывы — выберите, на какой ответить':d.focus.bad?'Плохие отзывы (1–2★)':'Последние отзывы';
  list.append(k.el('div','rv-section',label+(d.reviews.length?' · '+(d.reviews.length+d.more):'')));
  if(d.reviews.length)list.append(k.collapse(d.reviews.map(r=>review(k,d,r)),d.focus.reply?6:4,'Показать ещё отзывы'));
  else list.append(k.el('p','rv-note',d.focus.bad?'Плохих отзывов за этот период нет.':'Отзывов за этот период нет.'));
  if(d.more)list.append(k.el('small','kit-meta','Ещё '+d.more+' — в консоли магазина.'));
  body.append(list);
  for(const note of d.notes||[])body.append(k.el('small','kit-meta rv-footnote',note));
  const s=d.summary;
  const status=!s.count?{label:'нет отзывов',tone:''}:{label:num(s.average)+'★'+(s.delta!==null?' '+(s.delta>0?'+':s.delta<0?'−':'±')+num(Math.abs(s.delta)):''),tone:s.delta!==null&&s.delta<=-0.1?'alert':s.delta!==null&&s.delta>=0.1?'done':s.average!==null&&s.average<3?'alert':'accent',title:'Средняя оценка'+(s.delta!==null?' и изменение':'')};
  const where=d.stores.length===1?' в '+STORE[d.stores[0]]:'';
  const actions=[];
  if(d.focus.bad)actions.push({label:'Все отзывы',run:()=>k.ask('отзывы '+d.app+where+' за '+d.days+' дней',{send:true})});
  else actions.push({label:'Только плохие',run:()=>k.ask('плохие отзывы '+d.app+where+' за '+d.days+' дней',{send:true})});
  if(!d.focus.update)actions.push({label:'После обновления',title:'Последняя версия против предыдущей',run:()=>k.ask('отзывы '+d.app+where+' после обновления',{send:true})});
  if(d.days<30)actions.push({label:'За месяц',run:()=>k.ask('отзывы '+d.app+where+' за месяц',{send:true})});
  const subtitle=d.stores.map(x=>STORE[x]).join(' · ')+' · '+(d.focus.update&&d.version?'версия '+d.version:d.days+' '+plural(d.days,['день','дня','дней']))+(d.territory?' · '+d.territory:'');
  const node=k.card({app:'Отзывы в сторах',initial:'★',color:'#9a7a2c',key:d.app,status,subtitle,body,actions,className:'reviews-card'});
  const key=node.querySelector('.kit-key');if(key)raw(key);
  parent.append(node);
 };
})();
