// «Проверка тона», chat card: the message with the flagged fragments marked by severity, a calm ↔ harsh scale,
// the findings with «Заменить на …» (applied to the card's copy of the text, visible, never sent by itself), the
// softer whole message when the model wrote one, and actions: copy, send through a connected messenger
// (share-message: that app's own confirmation reviews it again), check again.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('tone-cards.css',document.currentScript.src).href;document.head.append(style);
 const AUDIENCE={public:'для канала',team:'коллегам',direct:'лично',customer:'клиенту'};
 const LEVEL={low:'чувствительность: низкая',medium:'чувствительность: средняя',high:'чувствительность: высокая'};
 const WEIGHT={problem:3,warning:2,info:1};
 const raw=node=>{node.dataset.noI18n='';return node;};

 // The text with marked spans (non-overlapping, in order); numbers match the list below.
 function marked(k,text,findings){
  const box=raw(k.el('div','tc-text selectable'));
  let at=0;
  findings.forEach((f,i)=>{
   if(!f.span||f.done||f.span.start<at)return;
   if(f.span.start>at)box.append(document.createTextNode(text.slice(at,f.span.start)));
   const m=k.el('mark','tc-mark',text.slice(f.span.start,f.span.end));m.dataset.severity=f.severity;m.title=f.message;
   const n=k.el('sup','tc-num',String(i+1));m.append(n);box.append(m);at=f.span.end;
  });
  if(at<text.length)box.append(document.createTextNode(text.slice(at)));
  return box;
 }
 // Calm ↔ harsh: weighted findings on a scale, with the counts per severity under it.
 function scale(k,findings){
  const open=findings.filter(f=>!f.done);
  const score=open.reduce((n,f)=>n+(WEIGHT[f.severity]||1),0);
  const box=k.el('div','tc-scale');
  const bar=k.el('div','tc-scale-bar');bar.setAttribute('role','img');
  const pos=Math.min(100,Math.round(score/9*100));
  const marker=k.el('span','tc-scale-marker');marker.style.left=pos+'%';bar.append(marker);
  bar.setAttribute('aria-label',open.length?'Тон: '+(pos>=66?'резко':pos>=33?'напряжённо':'почти спокойно'):'Тон: спокойно');
  const ends=k.el('div','tc-scale-ends');ends.append(k.el('span',null,'спокойно'),k.el('span',null,'резко'));
  const counts=k.el('div','tc-counts');
  for(const [level,label] of [['problem','может задеть'],['warning','лучше поправить'],['info','на заметку']]){const n=open.filter(f=>f.severity===level).length;if(!n)continue;const c=k.el('span','tc-count',label+': '+n);c.dataset.severity=level;counts.append(c);}
  box.append(bar,ends);if(counts.children.length)box.append(counts);
  return box;
 }

 window.renderToneCard=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.tone-card'))return;
  const state={text:String(d.text||''),findings:(d.findings||[]).map(f=>({...f,span:f.span?{...f.span}:null}))};
  const body=k.el('div','tc-body');
  // Apply one suggestion to the card's text and move the spans after it; overlapping ones are settled.
  function apply(f){
   const next=k.applyFinding(state.text,f);if(next===null){k.toast('Фрагмент уже изменён',{error:true});return;}
   const s=f.span?.start??0,e=f.span?f.span.end:state.text.length,delta=next.length-state.text.length;
   for(const g of state.findings){
    if(g===f||!g.span||g.done)continue;
    if(!f.span||g.span.start<e&&s<g.span.end){g.done=true;continue;}
    if(g.span.start>=e){g.span.start+=delta;g.span.end+=delta;}
   }
   f.done=true;state.text=next;paint();
  }
  function paint(){
   body.replaceChildren();
   body.append(scale(k,state.findings),marked(k,state.text,state.findings));
   const list=k.el('ol','tc-list');
   state.findings.forEach((f,i)=>{
    const li=k.el('li','tc-item'+(f.done?' done':''));li.dataset.severity=f.severity;li.value=i+1;
    const what=k.el('div','tc-item-text');
    if(f.span){const q=raw(k.el('q','tc-quote',f.span.text));what.append(q);}
    what.append(k.el('span','tc-message',f.message));
    li.append(what);
    if(typeof f.suggestion==='string'&&!f.done){
     const b=k.el('button','tc-apply');b.type='button';b.title=f.suggestion||'Убрать фрагмент';
     if(f.suggestion){b.append(k.el('span',null,'Заменить на'),raw(k.el('q',null,f.suggestion.length>50?f.suggestion.slice(0,49)+'…':f.suggestion)));}else b.append(k.el('span',null,'Убрать'));
     b.onclick=()=>apply(f);li.append(b);
    }else if(f.done)li.append(k.el('span','tc-done','исправлено'));
    list.append(li);
   });
   if(state.findings.length)body.append(list);
   else body.append(k.el('p','tc-ok','Резких слов, упрёков, ультиматумов и капслока не нашёл.'));
   if(d.rewrite){
    const box=k.el('div','tc-rewrite');box.append(k.el('div','tc-section','Мягче целиком'),raw(k.el('p','tc-rewrite-text selectable',d.rewrite)));
    const take=k.el('button',null,state.text===d.rewrite?'Вариант выбран':'Взять этот вариант');take.type='button';take.disabled=state.text===d.rewrite;
    take.onclick=()=>{state.text=d.rewrite;for(const f of state.findings)f.done=true;paint();};
    box.append(take);body.append(box);
   }else if(d.mode==='soften'&&!d.model&&state.findings.length)body.append(k.el('small','kit-meta','Переписать целиком сможет локальная модель — выберите её в настройках.'));
  }
  paint();
  const open=state.findings.filter(f=>f.severity!=='info').length;
  const status=state.findings.length?{label:'Замечаний: '+state.findings.length,tone:open?'alert':'progress',title:'Что может прозвучать не так'}:{label:'звучит спокойно',tone:'done'};
  const copy={label:'Скопировать',run:async()=>{await navigator.clipboard.writeText(state.text);k.toast('Текст скопирован');}};
  const again={label:'Проверить снова',run:()=>k.ask('как это звучит: '+state.text,{send:true})};
  const node=k.card({app:'Проверка тона',initial:'Т',color:'#6f5f9e',status,subtitle:[AUDIENCE[d.audience]||'',LEVEL[d.sensitivity]||''].filter(Boolean).join(' · '),body,
   actions:[copy,k.links('share-message',()=>({text:state.text})),again],className:'tone-card'});
  parent.append(node);
 };
})();
