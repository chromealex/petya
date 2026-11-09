// «Отсутствия», renderer. One card for a period (who is away), one person (when they come back) and a typed absence
// waiting for «Сохранить». The visualization is a strip of days: a column per day (weekends shaded, today marked),
// a row per colleague and a bar per absence coloured by kind (vacation, sick leave, day off, away); the absence being
// confirmed is a dashed bar. Below, the details with the source; absences typed in the chat have a red trash button
// with «Отменить».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('absence-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('absences',method,...args);
 const locale=()=>window.petyaLocale||'ru-RU';
 const DAY=86400000;
 const KIND={vacation:'отпуск',sick:'больничный',dayoff:'отгул',away:'нет на месте'};
 const SOURCE={chat:'отмечено в чате',calendar:'календарь'};
 const at=d=>new Date(d+'T12:00:00');
 const pad=v=>String(v).padStart(2,'0');
 const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const days=(from,to)=>{const out=[];for(let d=at(from);d<=at(to)&&out.length<62;d=new Date(d.getTime()+DAY))out.push(ymd(d));return out;};
 const short=d=>at(d).toLocaleDateString(locale(),{day:'numeric',month:'short'});
 const span=(a,b)=>a===b?short(a):short(a)+' – '+short(b);
 const raw=(k,cls,text)=>{const n=k.el('span',cls,text);n.dataset.noI18n='';return n;};

 function strip(k,data,list,draft){
  const all=days(data.from,data.to),n=all.length,wide=n<=16;
  const box=k.el('div','abs-strip'+(wide?'':' is-dense'));box.style.setProperty('--days',String(n));
  const head=k.el('div','abs-row abs-head');head.append(k.el('span','abs-name'));
  const scale=k.el('div','abs-track abs-scale');
  all.forEach((d,i)=>{
   const date=at(d),weekend=[0,6].includes(date.getDay());
   const cell=k.el('span','abs-day'+(weekend?' is-weekend':'')+(d===data.today?' is-today':''));
   const label=wide||date.getDay()===1||date.getDate()===1||i===0;
   if(label){cell.append(k.el('small',null,date.toLocaleDateString(locale(),{weekday:'short'})),k.el('b',null,String(date.getDate())));}
   cell.title=date.toLocaleDateString(locale(),{weekday:'long',day:'numeric',month:'long'});
   scale.append(cell);
  });
  head.append(scale);box.append(head);
  const people=data.people.length?data.people:[...new Map(list.map(r=>[r.member,{member:r.member,name:r.name}])).values()];
  for(const p of people){
   const row=k.el('div','abs-row'+(p.member===data.focus?' is-focus':''));
   const name=k.el('span','abs-name');name.append(k.avatar(p.name,{size:20}),k.el('span','abs-person',p.name));name.dataset.noI18n='';if(p.role)name.title=p.name+' · '+p.role;
   const track=k.el('div','abs-track');
   all.forEach(d=>{const date=at(d);track.append(k.el('span','abs-cell'+([0,6].includes(date.getDay())?' is-weekend':'')+(d===data.today?' is-today':'')));});
   const bars=list.filter(r=>r.member===p.member).map(r=>({...r,draft:false}));
   if(draft&&draft.member===p.member)bars.push({...draft,draft:true,source:'chat'});
   // Longer bars first, so a day off inside a vacation stays visible on top.
   bars.sort((x,y)=>(at(y.to)-at(y.from))-(at(x.to)-at(x.from)));
   for(const r of bars){
    const a=Math.max(0,Math.round((at(r.from)-at(data.from))/DAY)),b=Math.min(n-1,Math.round((at(r.to)-at(data.from))/DAY));
    if(b<0||a>n-1||b<a)continue;
    const bar=k.el('span','abs-bar kind-'+r.kind+(r.draft?' is-draft':'')+(at(r.from)<at(data.from)?' cut-start':'')+(at(r.to)>at(data.to)?' cut-end':''));
    bar.style.left=(a/n*100)+'%';bar.style.width=((b-a+1)/n*100)+'%';
    const label=KIND[r.kind]||r.kind;
    // The label only where it fits (about 4.5 letters per day column in the wide strip).
    if(b-a+1>=Math.max(wide?2:4,Math.ceil(label.length/(wide?4.5:2))))bar.append(k.el('span',null,label));
    bar.title=label+' · '+span(r.from,r.to)+(r.draft?' · ждёт подтверждения':' · '+(SOURCE[r.source]||r.sourceName||r.source))+(r.title?' · '+r.title:'');
    track.append(bar);
   }
   row.append(name,track);box.append(row);
  }
  const kinds=Object.keys(KIND).filter(kind=>list.some(r=>r.kind===kind)||draft?.kind===kind);
  if(kinds.length){const legend=k.el('div','abs-legend');for(const kind of kinds){const i=k.el('span','abs-key kind-'+kind);i.append(k.el('i'),k.el('span',null,KIND[kind]||kind));legend.append(i);}box.append(legend);}
  box.setAttribute('role','img');
  box.setAttribute('aria-label',list.length?list.map(r=>r.name+': '+(KIND[r.kind]||r.kind)+' '+span(r.from,r.to)).join('; '):'Отсутствий нет');
  return box;
 }

 function details(k,data,list,refresh){
  const rows=list.slice().sort((a,b)=>a.from.localeCompare(b.from)||a.name.localeCompare(b.name)).map(r=>{
   const li=k.el('li','abs-detail');
   const who=k.el('span','abs-detail-name',r.name);who.dataset.noI18n='';
   const kind=k.el('span','abs-dot kind-'+r.kind);
   const when=k.el('span','abs-detail-when');when.append(k.el('span',null,KIND[r.kind]||r.kind),raw(k,null,' · '+span(r.from,r.to)));
   const src=k.el('span','abs-source',SOURCE[r.source]||r.sourceName||r.source);
   if(r.title){src.title=r.title;}
   li.append(kind,who,when,src);
   if(r.removable&&r.id&&window.deleteButton){
    li.append(window.deleteButton('Удалить отметку',async()=>{
     try{
      const res=await call('remove',r.member,r.id);
      list.splice(list.indexOf(r),1);refresh();
      k.toast(res.text,{undo:async()=>{await call('restore',r.member,res.row);list.push(r);refresh();}});
     }catch(e){k.toast(e.message,{error:true});}
    }));
   }
   return li;
  });
  const ul=k.el('ul','abs-details');ul.append(...rows);
  return rows.length>6?k.collapse(rows,6):ul;
 }

 window.renderAbsenceCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.absence-card'))return;
  const list=(data.rows||[]).slice();
  const body=k.el('div','abs-body');
  let draft=data.mode==='confirm'?data.draft:null,saved=false;
  const status={label:'',tone:''};
  const paint=()=>{
   body.replaceChildren();
   if(draft&&!saved){
    const ask=k.el('div','abs-confirm');
    const who=k.el('b',null,draft.name);who.dataset.noI18n='';
    ask.append(who,raw(k,null,' — '),k.el('span','abs-kind',KIND[draft.kind]||draft.kind),raw(k,'abs-dates',span(draft.from,draft.to)));
    if(draft.note){const q=k.el('q','abs-quote',draft.note);q.dataset.noI18n='';ask.append(q);}
    body.append(ask);
   }
   body.append(strip(k,data,list,saved?null:draft));
   if(list.length&&data.mode!=='confirm')body.append(details(k,data,list,()=>{paint();chip();}));
   for(const n of data.notes||[]){const p=k.el('p','abs-note',n);body.append(p);}
  };
  const head=data.mode==='confirm'?'Отметить отсутствие':data.mode==='person'?(data.people[0]?.name||'Отсутствия'):'Отсутствия '+(data.label||'');
  const actions=[];
  let card;
  const chip=()=>{
   const away=new Set(list.map(r=>r.member)).size;
   const st=data.mode==='confirm'?(saved?{label:'сохранено',tone:'done'}:{label:'ждёт подтверждения',tone:'progress'}):away?{label:'отсутствуют: '+away,tone:'progress'}:{label:'все на месте',tone:'done'};
   status.label=st.label;status.tone=st.tone;
   const node=card?.querySelector('.kit-card-head .kit-chip');if(node){node.textContent=st.label;node.className='kit-chip tone-'+st.tone;}
  };
  chip();
  if(data.mode==='confirm'&&draft){
   actions.push({label:'Сохранить',primary:true,run:async()=>{
    const res=await call('confirm',draft.id);
    if(res?.row&&!res.row.existed)list.push({...res.row,removable:true});
    saved=true;card.classList.add('is-saved');paint();chip();card.querySelector('.kit-actions')?.remove();const title=card.querySelector('.kit-title');if(title)title.textContent='Отсутствие отмечено';k.toast(res?.text||'Сохранено');
   }},{label:'Отмена',run:async()=>{await call('cancel',draft.id);card.querySelector('.kit-actions')?.remove();draft=null;card.classList.add('is-cancelled');paint();const node=card.querySelector('.kit-card-head .kit-chip');if(node){node.textContent='не сохранено';node.className='kit-chip';}}});
  }else{
   actions.push({label:'Отметить отсутствие',run:()=>k.ask('Отметь, что ')});
  }
  paint();
  const meta=data.mode==='list'&&data.present?['на месте: '+data.present]:[];
  card=k.card({app:'Отсутствия',initial:'О',color:'#5f7a8a',status,title:head,subtitle:span(data.from,data.to),body,meta,actions,className:'absence-card'});
  parent.append(card);
  // A confirmation drawn again (after a restart or in an old chat) shows whether it was saved.
  if(data.mode==='confirm'&&draft)call('state',draft.id).then(state=>{
   if(state==='saved'){saved=true;list.push({...draft,removable:false});card.querySelector('.kit-actions')?.remove();const title=card.querySelector('.kit-title');if(title)title.textContent='Отсутствие отмечено';paint();chip();}
   else if(state==='expired'){card.querySelector('.kit-actions')?.remove();const node=card.querySelector('.kit-card-head .kit-chip');if(node){node.textContent='устарело';node.className='kit-chip';}}
  }).catch(()=>{});
 };
})();
