// «Зависимости», renderer: summary chips (outdated, major updates, vulnerabilities by severity), a stacked bar of
// patch/minor/major updates, per-ecosystem status, and a table of packages with current → wanted → latest, the update
// kind and advisory badges. Updating is handed to the coder in its own branch; the card never changes files.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('deps-cards.css',document.currentScript.src).href;document.head.append(style);
 const locale=()=>window.petyaLocale||'ru-RU';
 const SEV={critical:{label:'Критических',one:'критическая',tone:'alert'},high:{label:'Высоких',one:'высокая',tone:'alert'},moderate:{label:'Средних',one:'средняя',tone:'progress'},low:{label:'Низких',one:'низкая',tone:''},unknown:{label:'Без оценки',one:'без оценки',tone:''}};
 const KIND={patch:{label:'patch',tone:'done'},minor:{label:'minor',tone:'progress'},major:{label:'major',tone:'alert'}};
 const ECO={npm:'npm',pip:'pip',unity:'Unity',gradle:'Gradle',pods:'CocoaPods'};
 const RANK={critical:4,high:3,moderate:2,low:1,unknown:0};
 const raw=node=>{node.setAttribute('data-no-i18n','');return node;};
 const kindOf=(a,b)=>{const p=v=>String(v||'').replace(/^[v=]+/,'').split(/[.+-]/).map(Number);if(!a||!b||a===b)return null;const [x1=0,y1=0]=p(a),[x2=0,y2=0]=p(b);if([x1,y1,x2,y2].some(Number.isNaN))return null;if(x1!==x2)return x2>x1?'major':null;if(y1!==y2)return y2>y1?(x1===0?'major':'minor'):null;return 'patch';};
 // The safe target for a package: the newest patch/minor version it can move to without a major jump.
 function safeTarget(p){
  if(!['npm','pip'].includes(p.ecosystem)||!p.current)return null;
  for(const v of [p.latest,p.wanted]){const k=kindOf(p.current,v);if(k==='patch'||k==='minor')return v;}
  return null;
 }
 function stacked(k,sum){
  const box=k.el('div','deps-stack');
  const total=sum.patch+sum.minor+sum.major;
  const bar=k.el('div','deps-stack-bar');bar.setAttribute('role','img');
  bar.setAttribute('aria-label','Обновления: patch '+sum.patch+', minor '+sum.minor+', major '+sum.major);
  for(const key of ['patch','minor','major']){if(!sum[key])continue;const seg=k.el('span','deps-seg '+key);seg.style.flexGrow=String(sum[key]);seg.title=key+': '+sum[key];bar.append(seg);}
  if(!total)bar.append(k.el('span','deps-seg none'));
  const legend=k.el('div','deps-legend');
  for(const key of ['patch','minor','major']){const item=k.el('span','deps-legend-item');item.append(k.el('i','deps-dot '+key),k.el('span',null,key+' · '+sum[key]));legend.append(item);}
  box.append(bar,legend);return box;
 }
 function versions(k,p){
  const box=raw(k.el('span','deps-versions'));
  box.append(k.el('span','deps-current',p.current||p.spec||'—'));
  if(p.wanted&&p.wanted!==p.current){box.append(k.el('span','deps-arrow','→'),k.el('span',null,p.wanted));}
  if(p.latest&&p.latest!==p.wanted&&p.latest!==p.current){box.append(k.el('span','deps-arrow','→'),k.el('span','deps-latest',p.latest));}
  return box;
 }
 function badges(k,p){
  const box=k.el('span','deps-badges');
  const vulns=[...p.vulns].sort((a,b)=>RANK[b.severity]-RANK[a.severity]);
  for(const v of vulns.slice(0,3)){
   const url=k.safeUrl(v.url);const b=raw(k.el(url?'a':'span','deps-badge sev-'+v.severity,v.id));
   b.title=(SEV[v.severity]||SEV.unknown).one+(v.summary?' · '+v.summary:'')+(v.fixed?' · исправлено в '+v.fixed:'');
   if(url){b.href=url;b.target='_blank';b.rel='noopener';}
   box.append(b);
  }
  if(vulns.length>3)box.append(k.el('span','deps-more','+'+(vulns.length-3)));
  for(const f of p.flags||[])box.append(k.el('span','deps-flag',f));
  return box;
 }
 function packageTable(k,rows){
  return k.table([
   {label:'Пакет',value:p=>{const n=raw(k.el('span','deps-name',p.name));if(p.dev)n.append(k.el('small',null,' dev'));return n;}},
   {label:'Версия',value:p=>versions(k,p)},
   {label:'Обновление',value:p=>p.kind?k.chip({label:KIND[p.kind].label,tone:KIND[p.kind].tone}):k.el('span','deps-muted','—')},
   {label:'Уязвимости',value:p=>badges(k,p)},
   {label:'Экосистема',value:p=>k.el('span','deps-eco',ECO[p.ecosystem]||p.ecosystem)}
  ],rows);
 }
 window.renderDependencies=(parent,d)=>{
  const k=window.resultKit;if(!k||!d||parent.querySelector('.deps-card'))return;
  const sum=d.summary,packages=d.packages||[];
  const body=k.el('div','deps-body');
  const nv=Object.values(sum.vulns).reduce((a,b)=>a+b,0);
  const chips=k.el('div','deps-chips');
  chips.append(k.chip({label:'Устарело: '+sum.outdated,tone:sum.outdated?'progress':'done'}),k.chip({label:'Крупных обновлений: '+sum.major,tone:sum.major?'alert':''}));
  for(const key of ['critical','high','moderate','low','unknown'])if(sum.vulns[key])chips.append(k.chip({label:SEV[key].label+': '+sum.vulns[key],tone:SEV[key].tone}));
  if(!nv)chips.append(k.chip({label:'Уязвимостей не найдено',tone:'done'}));
  body.append(chips);
  if(sum.outdated)body.append(stacked(k,sum));
  const ecos=k.el('ul','deps-ecos');
  for(const e of d.ecosystems||[]){
   const li=k.el('li','status-'+e.status);
   li.append(raw(k.el('strong',null,e.label)));
   const status={ok:'проверено',offline:'нет сети',error:'ошибка',listed:'только список'}[e.status]||e.status;
   li.append(k.el('span','deps-eco-status',status));
   if(e.vulnSource)li.append(k.el('span','deps-muted','уязвимости: '+e.vulnSource));
   if(e.note)li.append(k.el('span','deps-muted',e.note));
   ecos.append(li);
  }
  body.append(ecos);
  for(const n of d.notes||[])body.append(k.el('p','deps-note',n));
  const listed=p=>p.kind||p.vulns.length||p.flags?.length||!['npm','pip'].includes(p.ecosystem);
  const tableBox=k.el('div','deps-table');body.append(tableBox);
  let onlyVulns=!!d.showVulns&&nv>0;
  const paint=()=>{
   const rows=packages.filter(p=>onlyVulns?p.vulns.length:listed(p));
   const hidden=packages.length-packages.filter(listed).length;
   tableBox.replaceChildren();
   if(!rows.length){tableBox.append(k.el('p','deps-muted',onlyVulns?'Уязвимых пакетов нет.':'Все проверенные пакеты актуальны.'));return;}
   tableBox.append(packageTable(k,rows.slice(0,20)));
   if(rows.length>20){const more=k.el('details','kit-more');more.append(k.el('summary',null,'Показать ещё · '+(rows.length-20)),packageTable(k,rows.slice(20)));tableBox.append(more);}
   if(!onlyVulns&&hidden>0)tableBox.append(k.el('p','deps-muted','Актуальных пакетов скрыто: '+hidden));
  };
  paint();
  const safe=packages.map(p=>({p,to:safeTarget(p)})).filter(x=>x.to);
  const actions=[];
  // Updating is a code change: offered only when «Программист» is added (cross-app link «code-fix»).
  if(safe.length)actions.push(k.links('code-fix',{text:'Как программист, обнови зависимости '+safe.slice(0,40).map(x=>x.p.name+' до '+x.to+' ('+x.p.ecosystem+')').join(', ')+' в отдельной ветке и прогони тесты'},
   {label:'Обновить безопасные (patch/minor) в ветке',primary:true,title:'Петя-программист обновит их в отдельной ветке и прогонит тесты'}));
  if(nv){
   const toggle={label:onlyVulns?'Показать все пакеты':'Показать уязвимости',run:b=>{onlyVulns=!onlyVulns;b.textContent=onlyVulns?'Показать все пакеты':'Показать уязвимости';paint();}};
   actions.push(toggle);
   const top=packages.flatMap(p=>p.vulns).filter(v=>k.safeUrl(v.url)).sort((a,b)=>RANK[b.severity]-RANK[a.severity])[0];
   const vulnerable=packages.filter(p=>p.vulns.length).sort((a,b)=>Math.max(...b.vulns.map(v=>RANK[v.severity]))-Math.max(...a.vulns.map(v=>RANK[v.severity])));
   actions.push(k.links('task-tracker',{title:'Уязвимые зависимости в '+d.project+': '+vulnerable.length,type:'bug',
    description:vulnerable.slice(0,10).map(p=>p.name+' '+(p.current||p.spec||'')+' ('+p.ecosystem+'): '+p.vulns.slice(0,3).map(v=>v.id+(v.fixed?' → '+v.fixed:'')).join(', ')).join('; '),link:top?.url||''}));
   if(top)actions.push({label:'Открыть advisory',title:top.id+(top.summary?' · '+top.summary:''),run:()=>{const a=document.createElement('a');a.href=k.safeUrl(top.url);a.target='_blank';a.rel='noopener';a.click();}});
  }
  actions.push({label:'Проверить снова',run:()=>k.ask('проверь зависимости'+(d.filter==='unity'?' юнити':''),{send:true})});
  const status=nv?{label:'есть уязвимости',tone:'alert'}:sum.outdated?{label:'есть обновления',tone:'progress'}:{label:'актуально',tone:'done'};
  const when=d.at?new Date(d.at).toLocaleString(locale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const card=k.card({app:'Зависимости',initial:'⧉',color:'#5a4a8a',key:d.project,status,subtitle:when,body,actions,className:'deps-card'});
  card.querySelector('.kit-key')?.setAttribute('data-no-i18n','');
  parent.append(card);
 };
})();
