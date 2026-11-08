// «Нейминг», renderer: the candidates (free first) with a verdict chip «свободно / похоже на … / занято», a length
// bar against the limit, a row of check dots (project, App Store, Google Play, .com), the meaning, transliteration
// and pronunciation notes, and «Скопировать» per name; «Ещё в этом стиле» and «Короче» send a follow-up.
(()=>{
 if(window.renderNamingCard)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('naming-cards.css',document.currentScript.src).href;document.head.append(style);
 const call=(method,...args)=>window.petya.feature('namingApp',method,...args);
 const copy=async(k,text)=>{try{await navigator.clipboard.writeText(text);k.toast('Скопировано');}catch{k.toast('Не удалось скопировать',{error:true});}};
 const KIND={hero:'Персонажи',item:'Предметы',event:'Ивент',feature:'Фича',place:'Локации',game:'Игра',other:'Названия'};
 const TONE={free:'done',similar:'progress',taken:'alert'};
 const TEXT={free:'свободно',similar:'похоже',taken:'занято',unknown:'не проверено'};
 const plain=(k,tag,cls,text)=>{const n=k.el(tag,cls,text);n.dataset.noI18n='';return n;};
 function verdictChip(k,v){
  if(v.status==='free')return k.chip({label:'свободно',tone:'done'});
  const node=k.el('span','kit-chip tone-'+TONE[v.status]);
  node.append(v.status==='taken'?'занято: ':'похоже на ',plain(k,'span',null,'«'+v.like+'»'));
  node.title=v.where;return node;
 }
 // One dot per check: project, App Store, Google Play, .com.
 function dots(k,r,checked){
  const box=k.el('div','naming-dots');
  const dot=(label,status,title)=>{const d=k.el('span','naming-dot is-'+(status||'skip'));d.append(k.el('i'),k.el('span',null,label));d.title=title;d.setAttribute('aria-label',label+': '+title);box.append(d);};
  const first=x=>x?.matches?.[0]?(x.matches[0].text||x.matches[0].name)+(x.matches[0].where?' · '+x.matches[0].where:x.matches[0].seller?' · '+x.matches[0].seller:''):'';
  dot('проект',checked.project?r.project?.status:null,checked.project?(r.project?.status==='free'?'совпадений нет':first(r.project)):'папка проекта не выбрана');
  dot('App Store',r.appStore?.status,r.appStore?.error||(r.appStore?.status==='free'?'совпадений нет':first(r.appStore)));
  dot('Google Play',r.googlePlay?.status,r.googlePlay?(r.googlePlay.status==='free'?'совпадений нет':first(r.googlePlay)):checked.googlePlayNote||'не проверено');
  if(r.domain)dot('.com',r.domain.status,r.domain.domain+' — '+(r.domain.status==='free'?'свободен':r.domain.status==='taken'?'занят':'нет ответа'));
  return box;
 }
 function row(k,r,max,checked){
  const li=k.el('li','naming-row is-'+r.verdict.status);
  const head=k.el('div','naming-head');
  const name=plain(k,'strong','naming-name',r.name);
  const b=k.el('button','naming-copy','Скопировать');b.type='button';b.onclick=()=>copy(k,r.name);b.setAttribute('aria-label','Скопировать «'+r.name+'»');
  head.append(name,verdictChip(k,r.verdict),b);
  const len=k.el('div','naming-length');
  const bar=k.el('span','naming-bar'),fill=k.el('i');fill.style.width=Math.min(100,r.length/max*100)+'%';if(r.length>max)bar.classList.add('over');bar.append(fill);
  len.append(bar,k.el('small',null,r.length+' симв.'+(r.words>1?' · '+r.words+' слова':'')));
  const sub=k.el('div','naming-sub');sub.append(len,dots(k,r,checked));
  li.append(head,sub);
  if(r.meaning)li.append(plain(k,'p','naming-meaning',r.meaning));
  const notes=[...(r.warnings||[]).map(t=>['warn',t]),...(r.notes||[]).map(t=>['note',t])];
  if(r.translit&&!(r.notes||[]).some(n=>n.includes(r.translit)))notes.unshift(['note',(r.script==='latin'?'читается как: ':'латиницей: ')+r.translit]);
  if(notes.length){const ul=k.el('ul','naming-notes');for(const [kind,text] of notes){const n=plain(k,'li','is-'+kind,text);ul.append(n);}li.append(ul);}
  return li;
 }
 window.renderNamingCard=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.naming-card'))return;
  const rows=d.candidates||[],max=d.limit||(d.kind==='game'?30:20);
  const free=rows.filter(r=>r.verdict.status==='free').length;
  const body=k.el('div','naming-body');
  const c=d.checked||{};
  const meta=[c.project?'проект: '+c.locFiles+' файл. локализации, '+c.codeFiles+' файл. кода':'проект не проверен',c.appStore?'App Store':'App Store недоступен',c.googlePlay?'Google Play':c.googlePlayNote?'':'Google Play не проверен'].filter(Boolean);
  if(c.domain)meta.push('.com');
  body.append(k.el('small','kit-meta naming-checked','Проверено: '+meta.join(' · ')));
  if(c.googlePlayNote)body.append(k.el('p','naming-note',c.googlePlayNote));
  const list=k.el('ol','naming-list');
  const items=rows.map(r=>row(k,r,max,c));
  if(items.length>6){list.append(...items.slice(0,6));const more=k.el('button','naming-more','Показать ещё '+(items.length-6));more.type='button';more.onclick=()=>{list.append(...items.slice(6));more.remove();};body.append(list,more);}
  else{list.append(...items);body.append(list);}
  const actions=[];
  if(d.mode==='make'){
   actions.push({label:'Ещё в этом стиле',primary:true,run:()=>k.ask('Придумай ещё названия в этом стиле, другие: '+d.request,{send:true})});
   actions.push({label:'Короче',run:()=>k.ask('Придумай названия короче: '+d.request,{send:true})});
  }
  if(!c.domain&&rows.some(r=>/[a-zа-яё]/i.test(r.name)))actions.push({label:'Проверить домены .com',run:async btn=>{
   const res=await call('domains',rows.map(r=>r.name));
   for(const [i,r] of rows.entries()){r.domain=res[r.name]||null;const fresh=dots(k,r,{...c,domain:true});items[i].querySelector('.naming-dots').replaceWith(fresh);}
   c.domain=true;btn.remove();
  }});
  if(rows.length>1)actions.push({label:'Скопировать все',run:()=>copy(k,rows.map(r=>r.name).join('\n'))});
  const key=d.mode==='check'?'Проверка названий':(KIND[d.kind]||'Названия');
  const node=k.card({app:'Нейминг',initial:'Aa',color:'#6a4f8a',key,status:rows.length?{label:'свободно '+free+' из '+rows.length,tone:free?'done':'alert'}:null,subtitle:d.request&&d.mode==='make'?d.request:'',body,actions,className:'naming-card'});
  node.dataset.mode=d.mode;
  const sub=node.querySelector('.kit-subtitle');if(sub)sub.dataset.noI18n='';
  parent.append(node);
 };
})();
