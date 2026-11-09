// One tab bar per page, shared by Petya's own sections and the tabs apps add (src/ui/extension-places.js).
// Core content stays where it is: a page child after the bar belongs to the core tab named in its
// data-page-tab (or the page's fallback tab; "*" = every core tab), and is hidden while another tab is open.
// App sections live in one panel at the end of the page. Tabs with the same name (case-insensitive, compared as
// the user sees them, after translation) are one tab: the core content first, then one section per app with its
// icon and name as a small header, in a stable order (order, then app name). An empty tab disappears.
(()=>{
 const pages=new Map();
 const display=title=>String((window.t||String)(String(title||''))).trim();
 const keyOf=title=>display(title).toLocaleLowerCase();
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};

 function state(pageId){
  if(pages.has(pageId))return pages.get(pageId);
  const page=document.getElementById(pageId);if(!page)return null;
  const bar=make('div','ux-tabs page-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Разделы');bar.hidden=true;
  const panel=make('div','page-tab-panel');
  const s={id:pageId,page,bar,panel,tabs:[],active:'',previous:'',fallback:'',onSelect:null,host:null};
  pages.set(pageId,s);
  // The panel with the apps' sections stays the last child, whatever the page appends later.
  new MutationObserver(()=>{if(s.panel.parentNode===page&&page.lastElementChild!==s.panel)page.append(s.panel);apply(s);}).observe(page,{childList:true});
  document.addEventListener('petya-view',event=>{if(event.detail===pageId)shown(s);});
  return s;
 }
 // Where the bar goes: a host the page names, or after the page heading, its status line and intro.
 function place(s,host){
  if(host){host.append(s.bar);s.host=host;}
  else if(!s.bar.parentNode){
   let anchor=s.page.querySelector(':scope>h1');
   for(let n=anchor?.nextElementSibling;n&&(n.matches('.ux-page-status')||n.tagName==='P');n=n.nextElementSibling)anchor=n;
   const wrap=make('div','page-tabs-host');if(anchor)anchor.after(wrap);else s.page.prepend(wrap);wrap.append(s.bar);s.host=wrap;
  }
  if(!s.panel.parentNode)s.page.append(s.panel);
 }
 const find=(s,key)=>s.tabs.find(t=>t.key===key);
 const contributors=tab=>(tab.core?1:0)+tab.sections.length;
 // Core tabs in their order first, then the apps' own tabs by order and name.
 function sort(s){
  const rank=t=>t.core?[0,t.core.index,'']:[1,Math.min(...t.sections.map(x=>x.order)),display(t.title)];
  s.tabs.sort((a,b)=>{const x=rank(a),y=rank(b);return x[0]-y[0]||x[1]-y[1]||x[2].localeCompare(y[2],window.petyaLocale||'ru');});
  for(const tab of s.tabs)tab.sections.sort((a,b)=>a.order-b.order||display(a.name).localeCompare(display(b.name),window.petyaLocale||'ru')||(a.owner<b.owner?-1:a.owner>b.owner?1:0));
 }
 function draw(s){
  sort(s);
  s.bar.replaceChildren(...s.tabs.map(tab=>{
   let b=tab.button;
   if(!b){b=make('button');b.type='button';b.setAttribute('role','tab');b.onclick=()=>select(s.id,tab.key);tab.button=b;}
   b.textContent=display(tab.core?tab.core.title:tab.title);b.dataset.tab=tab.core?tab.core.id:tab.key;b.dataset.tabKey=tab.key;
   b.setAttribute('aria-pressed',String(tab.key===s.active));b.setAttribute('aria-selected',String(tab.key===s.active));
   return b;
  }));
  s.bar.hidden=s.tabs.length<2;
  s.panel.replaceChildren(...s.tabs.flatMap(tab=>tab.sections.map(x=>{x.header.hidden=contributors(tab)<2;return x.node;})));
  apply(s);
 }
 // Shows the core content and the app sections of the open tab only.
 function apply(s){
  const tab=find(s,s.active),core=tab?.core?.id||null;
  let content=false;
  for(const child of s.page.children){
   if(child===s.panel)continue;
   if(!content){if(child===s.host||child.contains(s.bar))content=true;continue;}
   const own=child.dataset.pageTab||s.fallback;
   child.classList.toggle('page-tab-off',!!s.tabs.length&&!(core&&(own==='*'||own===core)));
  }
  for(const t of s.tabs)for(const x of t.sections)x.node.hidden=t!==tab;
  s.panel.hidden=!tab?.sections.length;
 }
 function shown(s){const tab=find(s,s.active);for(const x of tab?.sections||[])try{x.onShow?.();}catch(e){console.error('Tab «'+display(tab.title)+'»:',e);}}
 function select(pageId,which){
  const s=pages.get(pageId);if(!s)return;
  const tab=s.tabs.find(t=>t.key===which||t.core?.id===which);if(!tab)return;
  if(s.active!==tab.key){s.previous=s.active;s.active=tab.key;}
  for(const b of s.bar.children){const on=b.dataset.tabKey===tab.key;b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-selected',String(on));}
  apply(s);
  try{s.onSelect?.(tab.core?.id||null,tab.key);}catch(e){console.error(e);}
  if(!s.page.hidden)shown(s);
  document.dispatchEvent(new CustomEvent('petya-page-tab',{detail:{page:pageId,key:tab.key,core:tab.core?.id||null}}));
 }
 // Petya's own tabs of a page: [{id, title}], `fallback` = the tab of unmarked content ("*" = all of them).
 function core(pageId,list,{fallback,host,onSelect}={}){
  const s=state(pageId);if(!s)return null;
  place(s,host);s.fallback=fallback||list[0]?.id||'';if(onSelect)s.onSelect=onSelect;
  list.forEach((item,index)=>{
   const key=keyOf(item.title);let tab=find(s,key);
   if(!tab){tab={key,title:item.title,sections:[]};s.tabs.push(tab);}
   tab.core={id:item.id,title:item.title,index};
  });
  if(!s.active)s.active=keyOf(list.find(t=>t.id===s.fallback)?.title||list[0]?.title);
  draw(s);
  return {select:id=>select(pageId,id),bar:s.bar};
 }
 // A page without tabs of its own gets one named like the page the first time an app adds a tab to it.
 function implicit(s){
  if(s.tabs.some(t=>t.core))return;
  const heading=s.page.querySelector(':scope>h1');
  core(s.id,[{id:'main',title:heading?.dataset.title||heading?.textContent||s.id}],{fallback:'main'});
 }
 // A section of an app on a page: {owner, name, iconSvg, title, order, mount(body) → {onShow?}?}. Returns {body, remove}.
 function add(pageId,{owner,name,iconSvg='',title,order=100}){
  const s=state(pageId);if(!s)throw Error('Unknown page '+pageId);
  place(s);implicit(s);
  const key=keyOf(title);
  let tab=find(s,key);if(!tab){tab={key,title,sections:[]};s.tabs.push(tab);}
  if(tab.sections.some(x=>x.owner===owner))throw Error('«'+name+'» already has a tab «'+display(title)+'» on '+pageId);
  const node=make('section','page-tab-section'),header=make('div','page-tab-owner'),mark=make('span','page-tab-owner-icon'),label=make('span','page-tab-owner-name',display(name)),body=make('div','page-tab-body');
  node.dataset.owner=owner;node.dataset.tabKey=key;mark.setAttribute('aria-hidden','true');
  // iconSvg is validated by the registry (no scripts, styles, links or url()).
  if(iconSvg)mark.innerHTML=iconSvg;else mark.textContent=String(name||'?').slice(0,1);
  label.dataset.noI18n='';header.append(mark,label);node.append(header,body);
  const section={owner,name,order,node,header,body,onShow:null};
  tab.sections.push(section);draw(s);
  return {body,set onShow(fn){section.onShow=fn;},remove:()=>removeSection(s,tab,section)};
 }
 function removeSection(s,tab,section){
  tab.sections=tab.sections.filter(x=>x!==section);section.node.remove();
  if(!tab.core&&!tab.sections.length){
   s.tabs=s.tabs.filter(t=>t!==tab);tab.button?.remove();
   if(s.active===tab.key){const back=find(s,s.previous)||s.tabs[0];s.active='';if(back)select(s.id,back.key);}
  }
  draw(s);
 }
 function remove(pageId,owner){
  const s=pages.get(pageId);if(!s)return;
  for(const tab of [...s.tabs])for(const x of [...tab.sections])if(x.owner===owner)removeSection(s,tab,x);
 }
 const info=pageId=>{const s=pages.get(pageId);if(!s)return null;return {active:s.active,tabs:s.tabs.map(t=>({key:t.key,title:display(t.core?.title||t.title),core:t.core?.id||null,owners:t.sections.map(x=>x.owner)}))};};
 window.petyaTabs={core,add,remove,select,info,key:keyOf,forget:pageId=>pages.delete(pageId),mark:(node,id)=>{if(node)node.dataset.pageTab=id;return node;}};
})();
