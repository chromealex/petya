// «Релизный чек-лист», renderer: a progress ring (ready items of all), the items grouped as in the project's template
// with a status icon, the app that checked it, a short verdict and evidence links; manual items are ticked here
// (saved per release by the app). Actions: «Перепроверить» (the same request again), the status to the team
// (cross-app `share-message`) and tasks for the problems (cross-app `task-tracker`) — those apps confirm themselves.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('checklist-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('releaseChecklist',method,...args);
 const STATUS={ok:['ок','✓'],problem:['проблема','!'],unknown:['не проверено','?'],missing:['нет приложения','+'],todo:['не отмечено','']};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const NS='http://www.w3.org/2000/svg';
 const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};

 function ring(counts){
  const box=document.createElement('div');box.className='rc-ring';
  const r=24,c=2*Math.PI*r,share=counts.total?counts.ok/counts.total:0;
  const s=svg('svg',{viewBox:'0 0 60 60',width:60,height:60,'aria-hidden':'true'});
  s.append(svg('circle',{cx:30,cy:30,r,fill:'none','stroke-width':6,class:'rc-ring-track'}));
  const arc=svg('circle',{cx:30,cy:30,r,fill:'none','stroke-width':6,'stroke-linecap':'round',class:'rc-ring-arc '+(counts.problem?'alert':share>=1?'done':'progress'),
   'stroke-dasharray':(c*share).toFixed(2)+' '+c.toFixed(2),transform:'rotate(-90 30 30)'});
  s.append(arc);
  const label=document.createElement('span');label.className='rc-ring-label';label.textContent=counts.ok+'/'+counts.total;
  box.append(s,label);box.setAttribute('role','img');box.setAttribute('aria-label',(window.t?window.t('Готово'):'Готово')+' '+counts.ok+' / '+counts.total);
  return box;
 }

 window.renderReleaseChecklist=(parent,data)=>{
  const k=window.resultKit;if(!k||!data?.items||parent.querySelector('.rc-card'))return;
  const state={counts:{...data.counts},share:data.share,tasks:[...(data.tasks||[])]};
  const body=k.el('div','rc-body');

  // Summary: ring, counters, branch and the time of the check.
  const top=k.el('div','rc-top');const ringBox=k.el('div','rc-ring-wrap');
  const facts=k.el('div','rc-facts');
  const paintTop=()=>{
   ringBox.replaceChildren(ring(state.counts));
   const c=state.counts,line=k.el('div','rc-counts');
   const add=(n,text,tone)=>{if(n)line.append(k.chip({label:text+': '+n,tone}));};
   add(c.problem,'Проблемы','alert');add(c.todo,'Отметить','progress');add(c.unknown,'Не проверено','');add(c.missing,'Нет приложения','');
   if(!c.problem&&!c.todo&&!c.unknown&&!c.missing)line.append(k.chip({label:'Можно выпускать',tone:'done'}));
   facts.querySelector('.rc-counts')?.remove();facts.prepend(line);
   status.textContent=(window.t?window.t('готово'):'готово')+' '+c.ok+' / '+c.total;
   status.className='kit-chip tone-'+(c.problem?'alert':c.ok===c.total?'done':'progress');
  };
  const meta=k.el('div','rc-meta');
  if(data.branch){meta.append(k.el('span',null,'Ветка'),raw(k.el('code','rc-branch',data.branch)));}
  if(data.checkedAt&&window.timeElement){meta.append(k.el('span',null,'Проверено'),window.timeElement(data.checkedAt));}
  facts.append(meta);top.append(ringBox,facts);body.append(top);

  // Groups in template order.
  const groups=[];for(const item of data.items){let g=groups.find(x=>x.name===item.group);if(!g){g={name:item.group,custom:item.customGroup,items:[]};groups.push(g);}g.items.push(item);}
  for(const g of groups){
   const section=k.el('section','rc-group');
   const head=k.el('h5','rc-group-title',g.name);if(g.custom)raw(head);
   const list=k.el('ul','rc-list');
   for(const item of g.items){
    const li=k.el('li','rc-item '+item.status);li.dataset.item=item.id;li.dataset.status=item.status;
    const icon=k.el('span','rc-icon '+item.status);icon.title=STATUS[item.status]?.[0]||'';icon.setAttribute('aria-label',icon.title);
    if(item.kind==='manual'){
     const box=document.createElement('input');box.type='checkbox';box.className='rc-check';box.checked=!!item.done;box.setAttribute('aria-label',item.title);
     box.onchange=async()=>{box.disabled=true;
      try{const r=await call('tick',data.project.id,data.version,item.id,box.checked);item.done=box.checked;item.status=box.checked?'ok':'todo';li.className='rc-item '+item.status;li.dataset.status=item.status;icon.className='rc-icon '+item.status;
       if(r?.counts){state.counts=r.counts;state.share=r.share;state.tasks=r.tasks||state.tasks;}else{state.counts.ok+=box.checked?1:-1;state.counts.todo+=box.checked?-1:1;}
       paintTop();}
      catch(e){box.checked=!box.checked;k.toast(e.message,{error:true});}
      finally{box.disabled=false;}};
     icon.append(box);
    }else icon.textContent=STATUS[item.status]?.[1]||'?';
    const main=k.el('div','rc-main');
    const title=k.el('div','rc-title');const name=k.el('span','rc-name',item.title);if(item.custom)raw(name);title.append(name);
    if(item.kind==='auto'&&item.app)title.append(raw(k.el('span','rc-app',item.app)));
    if(item.kind==='manual')title.append(k.el('span','rc-app manual','вручную'));
    main.append(title);
    if(item.summary)main.append(raw(k.el('div','rc-summary',item.summary)));
    if(item.evidence?.length){
     const ev=k.el('ul','rc-evidence');raw(ev);
     for(const e of item.evidence){const row=document.createElement('li');const url=k.safeUrl(e.url||'');
      if(url){const a=k.el('a',null,e.text);a.href=url;a.target='_blank';a.rel='noopener';row.append(a);}else row.textContent=e.text;ev.append(row);}
     if(item.evidence.length>2&&item.status==='ok'){const more=k.el('details','rc-more');more.append(k.el('summary',null,'Подробности'),ev);main.append(more);}else main.append(ev);
    }
    li.append(icon,main);
    if(item.action?.ask){const b=k.el('button','rc-action',item.action.label||'Подробнее');raw(b);b.type='button';b.onclick=()=>k.ask(item.action.ask,{send:true});li.append(b);}
    list.append(li);
   }
   section.append(head,list);body.append(section);
  }

  const status=k.el('span','kit-chip');
  const actions=[
   {label:'Перепроверить',primary:true,run:()=>k.ask('готов ли релиз '+data.version,{send:true})},
   k.links('share-message',()=>({text:state.share}),{label:p=>p.label}),
   ...state.tasks.length?[k.links('task-tracker',()=>({tasks:state.tasks}),{label:()=>'Создать задачи по проблемам'})]:[]
  ];
  const card=k.card({app:'Релизный чек-лист',initial:'✓',color:'#4f6b3c',key:'Релиз '+data.version,status,subtitle:data.project?.id!=='general'?data.project?.name:'',body,actions,className:'rc-card'});
  if(data.project?.id!=='general')raw(card.querySelector('.kit-subtitle')||document.createElement('i'));
  paintTop();
  parent.append(card);
 };
})();
