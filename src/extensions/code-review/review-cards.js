// «Код-ревью», renderer: severity chips (also filters), a files list with a stacked bar of comments per file,
// each comment with the code excerpt (light syntax highlight, the commented line marked) and a suggestion shown as a
// diff. Actions: «Исправить» (code-fix with the exact comments), «Оставить комментарии в PR…» (one GitHub review,
// sent only after the confirmation row) and «Скрыть нит-пики».
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('review-cards.css',document.currentScript.src).href;document.head.append(style);
 const SEV={blocker:{label:'Блокеры',one:'блокер',tone:'alert'},warning:{label:'Замечания',one:'замечание',tone:'progress'},nit:{label:'Нит-пики',one:'нит-пик',tone:''}};
 const CAT={bug:'ошибка',security:'безопасность',perf:'скорость',style:'стиль',test:'тесты'};
 const num=n=>Number(n||0).toLocaleString(window.petyaLocale||'ru-RU');
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const KEYWORDS={
  js:'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|yield|delete|void',
  py:'def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|lambda|None|True|False|and|or|not|in|is|pass|break|continue|yield|async|await|self',
  c:'public|private|protected|static|final|readonly|const|var|val|let|fun|func|void|int|long|float|double|bool|boolean|string|String|char|byte|class|struct|interface|enum|new|return|if|else|for|foreach|while|switch|case|break|continue|null|nil|true|false|this|self|using|namespace|package|import|try|catch|finally|throw|throws|async|await|override|virtual|go|defer|fn|impl|match|mut',
  rb:'def|end|class|module|return|if|elsif|else|unless|while|do|nil|true|false|self|require|yield|begin|rescue|ensure',
  sh:'if|then|else|fi|for|do|done|case|esac|function|export|local|return|true|false',
  sql:'select|from|where|and|or|insert|update|delete|join|on|group|by|order|limit|local|function|end|return|if|then|else|nil|true|false',
  json:'true|false|null'
 };
 // Light highlighting: comments, strings, numbers, keywords as spans; everything else stays text.
 function highlight(k,text,lang){
  const box=raw(k.el('span','cr-code'));
  const words=KEYWORDS[lang];
  const comment=lang==='py'||lang==='sh'||lang==='rb'?'#.*$':lang==='sql'?'--.*$':'\\/\\/.*$|\\/\\*.*?(?:\\*\\/|$)';
  const re=new RegExp('('+comment+')|("(?:\\\\.|[^"\\\\])*"?|\'(?:\\\\.|[^\'\\\\])*\'?|`(?:\\\\.|[^`\\\\])*`?)|(\\b\\d+(?:\\.\\d+)?\\b)'+(words?'|\\b('+words+')\\b':''),'g');
  if(lang==='text'){box.textContent=text;return box;}
  let at=0;
  for(const m of text.matchAll(re)){
   if(!m[0])continue;
   if(m.index>at)box.append(text.slice(at,m.index));
   box.append(k.el('span',m[1]?'cr-com':m[2]?'cr-str':m[3]?'cr-num':'cr-kw',m[0]));
   at=m.index+m[0].length;
  }
  if(at<text.length)box.append(text.slice(at));
  return box;
 }
 function excerpt(k,c){
  const pre=k.el('div','cr-excerpt selectable');
  for(const l of c.excerpt){
   const row=k.el('div','cr-line'+(l.target?' target':'')+(l.kind==='add'?' add':''));
   row.append(k.el('span','cr-n',String(l.n)),k.el('span','cr-sign',l.kind==='add'?'+':' '),highlight(k,l.text,c.lang));
   pre.append(row);
  }
  return pre;
 }
 // The suggestion as a diff against the commented line.
 function suggestion(k,c){
  const box=k.el('div','cr-suggest selectable');
  box.append(k.el('span','cr-suggest-label','Предложение'));
  const old=c.excerpt.find(l=>l.target);
  if(old){const row=k.el('div','cr-line del');row.append(k.el('span','cr-sign','−'),highlight(k,old.text,c.lang));box.append(row);}
  for(const line of String(c.suggestion).split('\n')){const row=k.el('div','cr-line ins');row.append(k.el('span','cr-sign','+'),highlight(k,line,c.lang));box.append(row);}
  return box;
 }
 function commentNode(k,c){
  const item=k.el('li','cr-comment sev-'+c.severity);item.dataset.severity=c.severity;item.dataset.id=c.id;
  const head=k.el('div','cr-comment-head');
  head.append(k.chip({label:SEV[c.severity].one,tone:SEV[c.severity].tone}),k.el('span','cr-cat',CAT[c.category]||c.category));
  head.append(raw(k.el('span','cr-where',c.line?'стр. '+c.line:'весь файл')));
  if(c.by==='check')head.append(k.el('span','cr-by','проверка'));
  item.append(head,raw(k.el('p','cr-text',c.comment)));
  if(c.excerpt?.length)item.append(excerpt(k,c));
  if(c.suggestion)item.append(suggestion(k,c));
  return item;
 }
 // Stacked bar of the file's comments by severity.
 function bar(k,counts,scale){
  const box=k.el('span','cr-bar');
  const total=counts.blocker+counts.warning+counts.nit;
  box.style.width=Math.max(total?14:0,Math.round(100*total/Math.max(scale,1)))+'%';
  for(const sev of ['blocker','warning','nit'])if(counts[sev]){const seg=k.el('span','cr-seg '+sev);seg.style.flexGrow=String(counts[sev]);box.append(seg);}
  return box;
 }
 const short=p=>p.length>48?'…'+p.slice(-47):p;
 // A fix request for the Programmer with the exact visible comments.
 function fixText(c,list){
  const where=c.source==='pr'?'PR '+c.repo+'#'+c.number+(c.branch?' (ветка '+c.branch+')':''):'ветке '+(c.branch||'');
  let text='Исправь в коде проекта замечания код-ревью по '+where+':';
  list.forEach((x,i)=>{text+='\n'+(i+1)+'. '+x.file+(x.line?':'+x.line:'')+' ['+x.severity+'] '+x.comment+(x.suggestion?' Предложение: '+x.suggestion.replace(/\s*\n\s*/g,' ⏎ '):'');});
  return text.slice(0,3900);
 }

 window.renderCodeReview=(parent,c)=>{
  const k=window.resultKit;if(!k||!c||parent.querySelector('.cr-card'))return;
  let hideNits=k.store.get('code-review-nits','show')==='hide';const filter=new Set();
  const body=k.el('div','cr-body');
  // Summary: chips by severity (click = show only that severity), totals and what was skipped.
  const chips=k.el('div','cr-summary');
  const sevChips={};
  for(const sev of ['blocker','warning','nit']){
   const n=c.totals[sev];
   const chip=k.chip({label:SEV[sev].label+' '+num(n),tone:n?SEV[sev].tone:'',title:'Показать только: '+SEV[sev].label.toLowerCase(),onClick:()=>{filter.has(sev)?filter.delete(sev):filter.add(sev);paint();}});
   chip.dataset.severity=sev;sevChips[sev]=chip;chips.append(chip);
  }
  const stats=k.el('span','cr-stats');
  stats.append(k.el('span',null,'Файлов: '+num(c.totals.files)),k.el('span','cr-plus','+'+num(c.totals.additions)),k.el('span','cr-minus','−'+num(c.totals.deletions)));
  chips.append(stats);body.append(chips);
  const notes=[];
  if(c.totals.skipped)notes.push('Пропущено файлов: '+c.totals.skipped+' (lock, сторонние, сгенерированные, бинарные или сверх лимита).');
  if(!c.model)notes.push('Модель не выбрана — только автоматические проверки.');
  else if(c.dropped)notes.push('Отброшено замечаний модели без привязки к изменённой строке: '+c.dropped+'.');
  if(c.cut)notes.push('Модель прочитала не все файлы: изменений слишком много.');
  for(const n of notes)body.append(k.el('p','cr-note',n));
  // Files with their counts.
  const scale=Math.max(1,...c.files.map(f=>f.counts.blocker+f.counts.warning+f.counts.nit));
  const files=c.files.map(f=>{
   const row=k.el('button','cr-file'+(f.status==='skipped'?' skipped':''));row.type='button';
   row.append(raw(k.el('span','cr-file-name',short(f.path))));row.title=f.path+(f.label?' — '+f.label:'');
   const right=k.el('span','cr-file-side');
   if(f.status==='skipped')right.append(k.el('span','cr-file-why',f.label||'пропущен'));
   else{right.append(bar(k,f.counts,scale));const counts=k.el('span','cr-file-counts');for(const sev of ['blocker','warning','nit'])if(f.counts[sev])counts.append(k.el('span','cr-count '+sev,String(f.counts[sev])));if(!counts.childNodes.length)counts.append(k.el('span','cr-ok','✓'));right.append(counts);}
   row.append(right);
   row.onclick=()=>{const first=[...card.querySelectorAll('.cr-group')].find(g=>g.dataset.file===f.path);first?.scrollIntoView({block:'nearest',behavior:'smooth'});first?.classList.add('flash');setTimeout(()=>first?.classList.remove('flash'),900);};
   return row;
  });
  body.append(k.el('div','cr-section','Файлы'),k.collapse(files,6,'Ещё файлы'));
  // Comments grouped by file.
  const list=k.el('div','cr-comments');
  const groups=new Map();
  for(const x of c.comments){if(!groups.has(x.file))groups.set(x.file,[]);groups.get(x.file).push(x);}
  for(const [file,items] of groups){
   const g=k.el('section','cr-group');g.dataset.file=file;
   g.append(raw(k.el('div','cr-group-file',file)));
   const ul=k.el('ul','cr-list');for(const x of items)ul.append(commentNode(k,x));g.append(ul);list.append(g);
  }
  const empty=k.el('p','cr-empty',c.comments.length?'Все замечания скрыты фильтром.':'Замечаний нет — можно открывать PR.');
  body.append(k.el('div','cr-section','Замечания'),list,empty);
  const visible=()=>c.comments.filter(x=>(!hideNits||x.severity!=='nit')&&(!filter.size||filter.has(x.severity)));
  function paint(){
   const shown=new Set(visible().map(x=>x.id));
   for(const node of list.querySelectorAll('.cr-comment'))node.hidden=!shown.has(node.dataset.id);
   for(const g of list.querySelectorAll('.cr-group'))g.hidden=![...g.querySelectorAll('.cr-comment')].some(n=>!n.hidden);
   empty.hidden=!!shown.size&&c.comments.length>0;if(!c.comments.length)empty.hidden=false;
   for(const [sev,chip] of Object.entries(sevChips))chip.setAttribute('aria-pressed',String(filter.has(sev)));
   nitButton.textContent=hideNits?'Показать нит-пики':'Скрыть нит-пики';nitButton.dataset.state=hideNits?'hidden':'shown';
   if(postButton)postButton.title='Комментариев: '+visible().length;
  }
  const actions=[];
  if(c.comments.length)actions.push(k.links('code-fix',()=>({text:fixText(c,visible())}),{label:'Исправить',primary:!!c.totals.blocker,title:'Отдать видимые замечания на исправление'}));
  let postButton=null;
  if(c.source==='pr'&&c.comments.length){
   postButton=k.el('button',null,'Оставить комментарии в PR…');postButton.type='button';postButton.className='cr-post';
   postButton.onclick=()=>confirmPost();
   actions.push(postButton);
  }
  const nitButton=k.el('button','cr-nits');nitButton.type='button';nitButton.hidden=!c.totals.nit;
  nitButton.onclick=()=>{hideNits=!hideNits;k.store.set('code-review-nits',hideNits?'hide':'show');paint();};
  actions.push(nitButton);
  // Confirmation row: the exact number and the PR; nothing is sent before «Отправить».
  function confirmPost(){
   if(card.querySelector('.cr-confirm'))return;
   const chosen=visible();if(!chosen.length){k.toast('Нет видимых замечаний',{error:true});return;}
   const box=k.el('div','cr-confirm');box.setAttribute('role','group');
   const ask=k.el('span');ask.append('Комментариев: '+chosen.length+'. Отправить их в ',raw(k.el('b',null,c.repo+'#'+c.number)),' одним ревью от вашего имени?');box.append(ask);
   const yes=k.el('button','primary','Отправить');yes.type='button';const no=k.el('button',null,'Не отправлять');no.type='button';
   no.onclick=()=>box.remove();
   yes.onclick=async()=>{yes.disabled=no.disabled=true;yes.setAttribute('aria-busy','true');
    try{const r=await window.petya.feature('codeReview','postReview',c.key,chosen.map(x=>x.id));box.replaceChildren(k.el('span',null,r.text));postButton.disabled=true;
     if(k.safeUrl(r.url||'')){const a=k.el('a','cr-link','Открыть ревью');a.href=k.safeUrl(r.url);a.target='_blank';a.rel='noopener';box.append(a);}}
    catch(e){k.toast(e.message,{error:true});yes.disabled=no.disabled=false;}finally{yes.removeAttribute('aria-busy');}};
   box.append(yes,no);card.querySelector('.kit-actions').before(box);yes.focus();
  }
  const t=c.totals;
  const status=t.blocker?{label:'есть блокеры',tone:'alert'}:t.warning?{label:'есть замечания',tone:'progress'}:{label:'можно в PR',tone:'done'};
  const card=k.card({app:'Код-ревью',initial:'</>',color:'#3f6b62',key:c.source==='pr'?c.repo+'#'+c.number:c.title,href:c.url,status,
   subtitle:c.source==='pr'?(c.branch&&c.base?c.branch+' → '+c.base:''):c.repo,title:c.source==='pr'?c.title:'',body,actions,className:'cr-card'});
  for(const sel of ['.kit-key','.kit-subtitle','.kit-title'])card.querySelector(sel)?.setAttribute('data-no-i18n','');
  paint();
  parent.append(card);
 };
})();
