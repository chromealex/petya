// «Скриншот → задача» settings: the global shortcut — record it from the keyboard or type it, check it is free,
// reset to the default, try it out.
(()=>{
 const call=(method,...args)=>window.petya.feature('screenshotTask',method,...args);
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const mac=()=>(window.petyaPlatform||navigator.platform||'').toLowerCase().startsWith('mac')||window.petyaPlatform==='darwin';
 const pretty=acc=>!acc?'выключено':acc.replace('CommandOrControl',mac()?'Cmd':'Ctrl').replace('Alt',mac()?'Option':'Alt');
 const card=el('article','card');card.dataset.extension='screenshot-task';
 const title=el('h2',null,'Скриншот → задача');
 const about=el('p',null,'Сочетание клавиш снимает область экрана и открывает в чате карточку бага. Работает, пока Петя запущен.');
 const label=el('label',null,'Сочетание клавиш');
 const input=el('input');input.name='screenshotTaskShortcut';input.autocomplete='off';input.spellcheck=false;input.placeholder='CommandOrControl+Shift+2';input.dataset.noI18n='';
 label.append(input);
 const row=el('div','screenshot-shortcut-actions');row.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:4px';
 const record=el('button',null,'Записать с клавиатуры');record.type='button';
 const save=el('button','primary','Сохранить');save.type='button';
 const reset=el('button',null,'По умолчанию');reset.type='button';
 const off=el('button',null,'Выключить');off.type='button';
 const test=el('button',null,'Проверить: снять область');test.type='button';
 row.append(record,save,reset,off,test);
 const status=el('p');status.setAttribute('role','status');
 card.append(title,about,label,row,status);
 document.getElementById('settings-form')?.append(card);
 let recording=false,defaults='CommandOrControl+Shift+2';
 const show=r=>{if(!r)return;defaults=r.default||defaults;input.value=r.accelerator||'';
  status.textContent=r.error?r.error:r.registered?'Работает: '+pretty(r.registered)+'.':r.accelerator?'Включится, когда приложение добавлено и Петя запущен.':'Сочетание выключено — снимок можно попросить фразой «сделай баг из скриншота».';
  status.classList.toggle('error',!!r.error);};
 const run=work=>async()=>{for(const b of row.querySelectorAll('button'))b.disabled=true;try{show(await work());}catch(e){status.textContent=e.message;status.classList.add('error');}finally{for(const b of row.querySelectorAll('button'))b.disabled=false;}};
 // Keyboard → accelerator: Cmd/Ctrl become CommandOrControl so the same setting works on both systems.
 function fromEvent(e){
  if(['Meta','Control','Shift','Alt'].includes(e.key))return null;
  const key=/^Key[A-Z]$/.test(e.code)?e.code.slice(3):/^Digit\d$/.test(e.code)?e.code.slice(5):/^F\d{1,2}$/.test(e.code)?e.code:null;
  if(!key)return null;
  const mods=[];if(e.metaKey||e.ctrlKey)mods.push('CommandOrControl');if(e.altKey)mods.push('Alt');if(e.shiftKey)mods.push('Shift');
  return mods.length?[...mods,key].join('+'):null;
 }
 record.onclick=()=>{recording=true;status.classList.remove('error');status.textContent='Нажмите сочетание…';input.focus();};
 input.addEventListener('keydown',e=>{if(!recording)return;e.preventDefault();if(e.key==='Escape'){recording=false;status.textContent='';return;}const acc=fromEvent(e);if(acc){input.value=acc;recording=false;status.textContent='Записано: '+pretty(acc)+'. Нажмите «Сохранить».';}});
 save.onclick=run(()=>call('setShortcut',input.value.trim()));
 reset.onclick=run(()=>call('setShortcut',defaults));
 off.onclick=run(()=>call('setShortcut',''));
 test.onclick=run(async()=>{await call('capture');return call('shortcut');});
 const refresh=()=>call('shortcut').then(show).catch(()=>{});
 document.addEventListener('petya-settings-displayed',refresh);document.addEventListener('petya-extensions-changed',refresh);refresh();
})();
