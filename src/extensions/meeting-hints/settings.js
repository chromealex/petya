// «Подсказки на встрече» settings: when to hint (off by default), what is read and what is never stored or sent,
// and returning the kinds of hints the user turned off with «Не показывать такое».
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('meetingHints',method,...args);
 const card=el('article','card');card.dataset.extension='meeting-hints';
 card.append(el('h2',null,'Подсказки на встрече'),
  el('p',null,'Во время записи встречи, которую вы включили, Петя сверяет сказанное с решениями и обещаниями из сводок прошлых встреч и с глоссарием проекта и показывает подсказку в углу экрана — не чаще раза в 30 секунд, со ссылкой на источник.'),
  el('p','small','Разговор сравнивается только в памяти на этом компьютере: подсказки не сохраняются и никуда не отправляются, а расшифровка хранится ровно так же, как без них — в памяти встреч.'));
 const group=el('fieldset');group.style.cssText='border:0;padding:0;margin:8px 0;display:flex;flex-direction:column;gap:6px';
 group.append(el('legend',null,'Когда подсказывать'));
 const radios={};
 for(const [mode,label] of [['off','Не подсказывать'],['meeting','Только на текущей или следующей встрече'],['always','На всех записываемых встречах']]){
  const row=el('label');row.style.cssText='display:flex;gap:8px;align-items:center';
  const input=el('input');input.type='radio';input.name='meetingHintsMode';input.value=mode;radios[mode]=input;
  input.onchange=async()=>{try{await call('setMode',mode);status.textContent=mode==='off'?'Подсказки выключены.':'Сохранено.';}catch(e){status.textContent=e.message;refresh();}};
  row.append(input,el('span',null,label));group.append(row);
 }
 const muted=el('p','small');muted.style.color='var(--muted)';
 const unmute=el('button',null,'Снова показывать все виды подсказок');unmute.type='button';unmute.hidden=true;
 unmute.onclick=async()=>{try{await call('unmute');status.textContent='Все виды подсказок снова включены.';refresh();}catch(e){status.textContent=e.message;}};
 const status=el('p');status.setAttribute('role','status');
 card.append(group,muted,unmute,status);
 document.getElementById('settings-form').append(card);
 const NAMES={decision:'прошлые решения',promise:'обещания',term:'термины'};
 async function refresh(){
  try{
   const st=await call('state');
   for(const [mode,input] of Object.entries(radios))input.checked=st.mode===mode;
   muted.textContent=st.muted.length?'Не показываются: '+st.muted.map(k=>NAMES[k]||k).join(', ')+'.':'';
   unmute.hidden=!st.muted.length;
  }catch(e){status.textContent=e.message;}
 }
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
