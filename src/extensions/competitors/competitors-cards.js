// «Конкуренты», renderer: competitor rows with an icon placeholder (initials; no store images are downloaded), rating
// with a sparkline from the daily snapshots, last update chip, change badges, highlights quoted from the release
// notes and the full notes collapsible; «Убрать» (red trash, undo in the toast), «Следить» for search candidates,
// a rating comparison with our games, and follow-ups «Сравнить с нами» / «Что нового».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('competitors-cards.css',document.currentScript.src).href;document.head.append(style);
 const SVG='http://www.w3.org/2000/svg';
 const locale=()=>window.petyaLocale||'ru-RU';
 const DAY=86400000;
 const num=(v,d=2)=>Number(v).toLocaleString(locale(),{minimumFractionDigits:d===2?1:0,maximumFractionDigits:d});
 const big=n=>n>=1000?new Intl.NumberFormat(locale(),{notation:'compact',maximumFractionDigits:1}).format(n):Number(n||0).toLocaleString(locale());
 const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString(locale(),{day:'numeric',month:'short',timeZone:'UTC'});};
 const ago=iso=>{const d=Math.floor((Date.now()-Date.parse(iso))/DAY);return d<=0?'сегодня':d===1?'вчера':d+' дн. назад';};
 const mb=b=>Math.round(b/1048576).toLocaleString(locale())+' МБ';
 // Russian forms; another interface language takes the singular only for exactly one (the word is translated in the DOM).
 const plural=(n,[a,b,c])=>{if(window.petyaLanguage&&window.petyaLanguage!=='ru')return Math.abs(n)===1?a:c;const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};
 // Store and model text (names, developers, release notes) is never machine-translated.
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const feature=(method,...args)=>window.petya.feature('competitors',method,...args);
 const hue=name=>{let h=0;for(const ch of String(name))h=(h*31+ch.codePointAt(0))%360;return h;};
 // «Clash of Clans» → «CC»: short lowercase words (of, the, de) are skipped.
 const initials=name=>String(name||'?').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w&&!(w.length<=3&&w===w.toLowerCase())).slice(0,2).map(w=>Array.from(w)[0]).join('').toLocaleUpperCase()||'?';
 const KIND={'механика':'механика','контент':'контент','событие':'событие','баланс':'баланс','монетизация':'монетизация','исправления':'исправления','другое':'другое'};

 function icon(k,name,ours){const box=k.el('span','cmp-icon'+(ours?' ours':''),initials(name));box.style.setProperty('--h',String(hue(name)));box.setAttribute('aria-hidden','true');return raw(box);}

 function spark(history){
  const pts=history.filter(x=>x.rating!=null);
  const w=88,h=26;
  const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('class','cmp-spark');svg.setAttribute('aria-hidden','true');
  const vals=pts.map(p=>p.rating),min=Math.min(...vals),max=Math.max(...vals),span=Math.max(0.1,max-min);
  const xy=pts.map((p,i)=>[+(pts.length>1?i*w/(pts.length-1):w/2).toFixed(1),+(h-3-(h-6)*(p.rating-min)/span).toFixed(1)]);
  const line=document.createElementNS(SVG,'polyline');line.setAttribute('points',xy.map(p=>p.join(',')).join(' '));line.setAttribute('class','line');
  const dot=document.createElementNS(SVG,'circle');dot.setAttribute('cx',xy.at(-1)[0]);dot.setAttribute('cy',xy.at(-1)[1]);dot.setAttribute('r','2.2');dot.setAttribute('class','dot');
  svg.append(line,dot);return svg;
 }

 function badges(k,r){
  const out=[];
  for(const c of r.changes||[]){
   if(c.kind==='version')out.push(k.chip({label:'новая версия '+c.to,tone:'progress',title:c.from+' → '+c.to}));
   else if(c.kind==='notes')out.push(k.chip({label:'новое описание',tone:'progress'}));
   else if(c.kind==='rating'){const d=c.to-c.from;out.push(k.chip({label:'рейтинг '+(d>0?'+':'−')+num(Math.abs(d)),tone:d>0?'done':'alert',title:num(c.from)+' → '+num(c.to)}));}
   else if(c.kind==='ratings')out.push(k.chip({label:'оценок '+(c.to>c.from?'+':'−')+big(Math.abs(c.to-c.from)),tone:''}));
   else if(c.kind==='size'){const d=c.to-c.from;out.push(k.chip({label:'размер '+(d>0?'+':'−')+mb(Math.abs(d)),tone:d>0?'alert':'done',title:mb(c.from)+' → '+mb(c.to)}));}
   else if(c.kind==='price')out.push(k.chip({label:'цена изменилась',tone:'progress'}));
  }
  return out;
 }

 function row(k,r,ctx){
  const li=k.el('article','cmp-row'+(r.ours?' ours':'')+(ctx.mark===r.key?' marked':''));li.dataset.key=r.key;
  const head=k.el('div','cmp-head');
  const titles=k.el('div','cmp-titles');
  const line=k.el('div','cmp-line');
  const safe=k.safeUrl(r.url||'');
  const name=raw(k.el(safe?'a':'span','cmp-name',r.name));if(safe){name.href=safe;name.target='_blank';name.rel='noopener';}name.title=r.name;
  line.append(name);
  if(r.ours)line.append(k.chip({label:'мы',tone:'done'}));
  line.append(k.chip({label:r.store==='play'?(r.web?'Google Play · поиск':'Google Play'):'App Store',title:r.web?'Google Play без открытого API: данные из поиска в интернете':''}));
  titles.append(line);
  if(r.developer)titles.append(raw(k.el('span','cmp-dev',r.developer)));
  const rating=k.el('div','cmp-rating');
  if(r.rating!=null){const v=k.el('strong',null,'★ '+num(r.rating));rating.append(v,k.el('small',null,r.ratings!=null?big(r.ratings)+' '+plural(r.ratings,['оценка','оценки','оценок']):r.web?'из поиска':''));
   if(r.ratingDelta!=null&&Math.abs(r.ratingDelta)>=0.01)rating.append(k.el('small','cmp-delta '+(r.ratingDelta>0?'up':'down'),(r.ratingDelta>0?'▲ +':'▼ −')+num(Math.abs(r.ratingDelta))+' с '+date(r.ratingFrom)));}
  else rating.append(k.el('small',null,'рейтинга нет'));
  const trend=k.el('div','cmp-trend');
  if((r.history||[]).length>=2){trend.append(spark(r.history),k.el('small',null,'рейтинг с '+date(r.history[0].day)));trend.title=r.history.map(x=>date(x.day)+': '+num(x.rating)).join('\n');}
  else if(!ctx.candidates&&!r.ours)trend.append(k.el('small','cmp-nohist','история с '+date(r.history?.[0]?.day||ctx.checked)));
  head.append(icon(k,r.name,r.ours),titles,trend,rating);
  li.append(head);
  const meta=k.el('div','cmp-meta');
  if(r.updated){const fresh=Date.now()-Date.parse(r.updated)<=7*DAY;meta.append(k.chip({label:'обновлено '+date(r.updated)+' · '+ago(r.updated),tone:fresh?'progress':'',title:'Последнее обновление в магазине'}));}
  if(r.version)meta.append(raw(k.el('span','cmp-fact','v'+r.version)));
  if(r.size)meta.append(k.el('span','cmp-fact',mb(r.size)));
  if(r.price)meta.append(raw(k.el('span','cmp-fact',r.formattedPrice||String(r.price))));
  if(r.genre)meta.append(raw(k.el('span','cmp-fact',r.genre)));
  meta.append(...badges(k,r));
  if(meta.children.length)li.append(meta);
  // Highlights are quotes of the release notes (checked against the text in the main process).
  if(r.highlights?.length&&!ctx.candidates){
   const list=k.el('ul','cmp-highlights');
   for(const x of r.highlights.slice(0,3)){const item=k.el('li');if(x.kind)item.append(k.el('span','cmp-kind',KIND[x.kind]||x.kind));item.append(raw(k.el('q',null,x.quote)));list.append(item);}
   li.append(list);
  }
  if(r.notes&&!ctx.candidates){
   const more=k.el('details','cmp-notes');const sum=k.el('summary',null,r.version?'Что нового в '+r.version:'Описание обновления');more.append(sum,raw(k.el('p',null,r.notes)));li.append(more);
  }
  if(r.web?.sources?.length){const src=k.el('div','cmp-sources');src.append(k.el('span',null,'Источник: '));for(const x of r.web.sources.slice(0,2)){const u=k.safeUrl(x.url);if(!u)continue;const a=raw(k.el('a',null,x.title||u));a.href=u;a.target='_blank';a.rel='noopener';src.append(a);}li.append(src);}
  const actions=k.el('div','cmp-actions');
  if(ctx.candidates){
   const follow=k.el('button','primary',r.tracked?'Уже отслеживается':'Следить');follow.type='button';follow.disabled=!!r.tracked;
   follow.onclick=async()=>{follow.disabled=true;try{const x=await feature('add',ctx.project,{store:r.store,id:r.id,name:r.name,developer:r.developer});follow.textContent='Отслеживается ✓';follow.dataset.state='tracked';k.toast(x.text);}catch(e){follow.disabled=false;k.toast(e.message,{error:true});}};
   actions.append(follow);
  }
  if(safe){const open=k.el('button',null,r.store==='play'?'Открыть в Google Play':'Открыть в App Store');open.type='button';open.onclick=()=>window.open(safe,'_blank','noopener');actions.append(open);}
  if(!ctx.candidates&&!r.ours){
   const remove=window.deleteButton?window.deleteButton('Убрать из конкурентов'):(()=>{const b=k.el('button',null,'Убрать');b.type='button';return b;})();
   remove.classList.add('cmp-remove');
   remove.onclick=async()=>{
    remove.disabled=true;
    try{
     const x=await feature('remove',ctx.project,r.key);li.classList.add('removed');li.dataset.state='removed';
     k.toast(x.text,{timeout:10000,undo:async()=>{const y=await feature('restore',ctx.project,x.entry);li.classList.remove('removed');li.dataset.state='';remove.disabled=false;k.toast(y.text);}});
    }catch(e){remove.disabled=false;k.toast(e.message,{error:true});}
   };
   actions.append(remove);
  }
  li.append(actions);
  return li;
 }

 // Compare: our games and competitors on one rating scale.
 function compare(k,ours,rows){
  const box=k.el('div','cmp-compare');box.append(k.el('div','cmp-section','Рейтинг: мы и конкуренты'));
  const all=[...ours,...rows].filter(r=>r.rating!=null);
  const min=Math.min(3,...all.map(r=>r.rating)),max=5;
  for(const r of all){
   const line=k.el('div','cmp-bar'+(r.ours?' ours':''));
   const bar=k.el('span','cmp-bar-track');const fill=k.el('span');fill.style.width=Math.max(2,100*(r.rating-min)/(max-min))+'%';bar.append(fill);
   line.append(raw(k.el('span','cmp-bar-name',r.name)),bar,k.el('span','cmp-bar-value',num(r.rating)),k.el('span','cmp-bar-count',r.ratings!=null?big(r.ratings):''));
   box.append(line);
  }
  return box;
 }

 window.renderCompetitors=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.cmp-card'))return;
  const body=k.el('div','cmp-body');
  const rows=c.rows||[],ours=c.ours||[];
  const ctx={project:c.project?.id||'',mark:c.mark,checked:c.checked,candidates:c.mode==='candidates'};
  if(c.mode==='removed'&&c.removed){
   const p=k.el('p','cmp-empty');p.append(k.el('span',null,'Убрано из конкурентов: '),raw(k.el('strong',null,c.removed.name)),k.el('span',null,'. История снимков сохранена.'));body.append(p);
  }
  if(c.mode==='compare'&&(ours.length||rows.length))body.append(compare(k,ours,rows));
  const nodes=[...(c.mode==='compare'?ours:[]),...rows].map(r=>row(k,r,ctx));
  if(nodes.length)body.append(k.collapse(nodes,6,'Ещё игры'));
  else if(c.mode!=='removed')body.append(k.el('p','cmp-empty','Список пуст.'));
  if(c.notes?.length){const n=k.el('ul','cmp-notes-list');for(const x of c.notes)n.append(k.el('li',null,x));body.append(n);}
  const changed=rows.filter(r=>r.changes?.length).length,fresh=rows.filter(r=>r.fresh).length;
  const status=ctx.candidates?{label:rows.length+' '+plural(rows.length,['вариант','варианта','вариантов']),tone:'progress'}:c.mode==='removed'?{label:'убрано',tone:''}:
   changed?{label:changed+' '+plural(changed,['с изменениями','с изменениями','с изменениями']),tone:'progress'}:fresh?{label:'обновились: '+fresh,tone:'progress'}:{label:'без изменений',tone:'done'};
  const subtitle=['App Store · '+String(c.country||'us').toUpperCase(),c.checked?'проверено '+date(c.checked):''].filter(Boolean).join(' · ');
  const actions=[];
  if(c.mode==='removed'&&c.removed)actions.push({label:'Вернуть',primary:true,run:async b=>{const y=await feature('restore',ctx.project,c.removed);k.toast(y.text);b.dataset.state='restored';}});
  if(!ctx.candidates&&c.mode!=='compare')actions.push({label:'Сравнить с нами',run:()=>k.ask('Сравни наши игры с конкурентами',{send:true})});
  if(!ctx.candidates&&!['news','mechanics'].includes(c.mode))actions.push({label:'Что нового у конкурентов',run:()=>k.ask('Что нового у конкурентов',{send:true})});
  actions.push({label:'Добавить конкурента',run:()=>k.ask('Добавь в конкуренты ')});
  const card=k.card({app:'Конкуренты',initial:'К',color:'#4b3f6b',key:c.project?.name||'Конкуренты',status,subtitle,body,actions,className:'cmp-card'});
  const key=card.querySelector('.kit-key');if(key&&c.project?.name)raw(key);
  parent.append(card);
 };
})();
