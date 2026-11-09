// Person fields apps add to the cards of «Команда» (extension.json "ui" → "personFields", docs/extensions.md §8a),
// drawn by src/ui/extension-places.js through this host. The team page (team.js) mounts every card here; a field is
// one more labelled item of the card, before its photo and services, sorted by `order` and then by app name.
// Where the value lives: a stored person attribute the page keeps but does not show (a hidden input marked
// data-kept, e.g. one Slack fills) keeps its key; any other key goes into the person's `fields` map. Either way it is
// saved with the team, and it stays in the record while the app is off: only the field disappears.
// Renderer: render(container, {extension, key, value, set(value), person, kit, feature}); `set` marks the team as
// changed. Keys the page shows itself (name, role, …) are refused with a clear error in the dev console.
(()=>{
 const fields=new Map(),cards=new Set();
 const display=v=>String((window.t||String)(String(v||'')));
 const live=()=>{for(const c of [...cards])if(!c.card.isConnected)cards.delete(c);return [...cards];};
 const sorted=()=>[...fields.values()].sort((a,b)=>a.order-b.order||display(a.name).localeCompare(display(b.name),window.petyaLocale||'ru')||(a.owner<b.owner?-1:1));
 function store(c,key){
  const own=c.editor.querySelector('[data-field="'+key+'"]');
  if(own)return own.dataset.kept==='true'?{get:()=>own.value,set:v=>{own.value=v;}}:null;
  const map=c.editor.querySelector('[data-field="fields"]');if(!map)return null;
  const read=()=>{try{const v=JSON.parse(map.value||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}};
  return {get:()=>String(read()[key]??''),set:v=>{const next=read();if(v)next[key]=v;else delete next[key];map.value=JSON.stringify(next);}};
 }
 function person(c){const out={};for(const n of c.editor.querySelectorAll('[data-field]'))if(n.dataset.field!=='fields'&&n.dataset.field!=='photo')out[n.dataset.field]=n.value;return out;}
 function draw(c,f){
  c.nodes.get(f.id)?.remove();c.nodes.delete(f.id);
  const slot=store(c,f.key);
  if(!slot){if(!f.refused){f.refused=true;console.error('[extensions] «'+f.owner+'»: '+display('Поле пропущено: ключ занят полем карточки')+' «'+f.key+'»');}return;}
  const wrap=document.createElement('div');wrap.className='team-person-field';wrap.dataset.personField=f.key;wrap.dataset.owner=f.owner;
  const label=document.createElement('span');label.className='team-person-field-title';label.textContent=f.title;
  const body=document.createElement('div');body.className='team-person-field-body';wrap.append(label,body);
  c.nodes.set(f.id,wrap);
  for(const g of sorted()){const n=c.nodes.get(g.id);if(n)c.anchor.before(n);}
  const changed=value=>{slot.set(String(value??''));(c.editor.querySelector('[data-field="'+f.key+'"]')||c.editor.querySelector('[data-field="fields"]'))?.dispatchEvent(new Event('input',{bubbles:true}));};
  Promise.resolve().then(()=>f.render(body,{extension:f.owner,key:f.key,value:slot.get(),set:changed,person:person(c),kit:window.resultKit})).catch(e=>console.error('[extensions] «'+f.owner+'»: '+e.message));
 }
 window.petyaPersonFields={
  // An app's field: {owner, name, key, title, order, render(container, api)}. Returns {remove}.
  add({owner,name,key,title,order=100,render}){
   const id=owner+'|'+key,f={id,owner,name:name||owner,key,title,order,render};fields.set(id,f);
   for(const c of live())draw(c,f);
   return {remove(){fields.delete(id);for(const c of live()){c.nodes.get(id)?.remove();c.nodes.delete(id);}}};
  },
  // A card of «Команда»: its editor, and the node app fields go before.
  mount(card,{editor,anchor}){const c={card,editor,anchor,nodes:new Map()};cards.add(c);for(const f of sorted())draw(c,f);},
  list:()=>sorted().map(f=>({owner:f.owner,key:f.key,title:f.title}))
 };
})();
