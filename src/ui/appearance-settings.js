// Settings card «Оформление» (the «Приложение» tab): light / dark / as the system, a preset for each, the accent
// colour and the text size. Changes apply at once to every Petya window (src/features/appearance.cjs).
(()=>{
 const call=(method,...args)=>window.petya.feature('appearance',method,...args);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.id='appearance';
 card.append(el('h2',null,'Оформление'),el('p','small','Тема и цвета всех окон Пети. «Как в системе» следует за светлой или тёмной темой компьютера.'));
 const modes=el('div','appearance-modes');modes.setAttribute('role','radiogroup');modes.setAttribute('aria-label','Тема оформления');
 const presets=el('div','appearance-presets');
 const accentRow=el('div','appearance-accent');const accentLabel=el('label',null,'Акцентный цвет');const accent=el('input');accent.type='color';accent.setAttribute('aria-label','Акцентный цвет');accentLabel.append(accent);
 const accentReset=el('button','quiet','Как в теме');accentReset.type='button';accentRow.append(accentLabel,accentReset);
 const sizeRow=el('div','appearance-size');sizeRow.append(el('span','appearance-size-label','Размер текста'));const sizes=el('div','appearance-sizes');sizes.setAttribute('role','radiogroup');sizes.setAttribute('aria-label','Размер текста');sizeRow.append(sizes);
 const status=el('p','small');status.setAttribute('role','status');
 card.append(modes,presets,accentRow,sizeRow,status);
 let state=null,busy=false;
 async function set(patch){if(busy)return;busy=true;try{state=await call('set',patch);window.applyAppearance?.(state);paint();}catch(e){status.textContent=e.message;}finally{busy=false;}}
 const chip=(text,on,run)=>{const b=el('button','appearance-chip'+(on?' active':''),text);b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(on));b.onclick=run;return b;};
 function paint(){
  if(!state)return;
  const system=matchMedia('(prefers-color-scheme: dark)').matches,theme=state.mode==='dark'||state.mode==='system'&&system?'dark':'light';
  modes.replaceChildren(...[['system','Как в системе'],['light','Светлая'],['dark','Тёмная']].map(([id,label])=>chip(label,state.mode===id,()=>set({mode:id}))));
  // Presets of the theme in use (the other mode's choice is kept and shows when the system switches).
  const tiles=state.presets.filter(p=>p.mode===theme).map(p=>{
   const on=state[theme]===p.id,tile=el('button','appearance-tile'+(on?' active':''));tile.type='button';tile.setAttribute('aria-pressed',String(on));tile.title=p.name;
   const pre=el('span','appearance-preview');pre.style.background=p.preview.bg;const pane=el('span','appearance-preview-panel');pane.style.background=p.preview.panel;pane.style.borderColor=p.preview.accent;
   const line=el('span','appearance-preview-line');line.style.background=p.preview.ink;const dot=el('span','appearance-preview-dot');dot.style.background=p.preview.accent;pane.append(line,dot);pre.append(pane);
   tile.append(pre,el('span','appearance-tile-name',p.name));tile.onclick=()=>set({[theme]:p.id});return tile;});
  presets.replaceChildren(el('p','small appearance-presets-title',theme==='dark'?'Тёмные темы':'Светлые темы'),...tiles);
  const current=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  accent.value=state.accent||(/^#[0-9a-f]{6}$/i.test(current)?current:'#d0f596');accentReset.hidden=!state.accent;
  sizes.replaceChildren(...[['compact','Мельче'],['normal','Обычный'],['large','Крупнее']].map(([id,label])=>chip(label,state.size===id,()=>set({size:id}))));
 }
 accent.oninput=()=>{document.documentElement.style.setProperty('--accent',accent.value);};
 accent.onchange=()=>set({accent:accent.value});
 accentReset.onclick=()=>set({accent:''});
 async function load(){try{state=await call('get');paint();}catch(e){status.textContent=e.message;}}
 const anchor=document.getElementById('interface-language');
 if(anchor)anchor.before(card);else document.getElementById('settings-form')?.prepend(card);
 document.addEventListener('petya-appearance',e=>{if(e.detail?.state)state=e.detail.state;if(state)paint();});
 document.addEventListener('petya-settings-displayed',load);
 load();
})();
