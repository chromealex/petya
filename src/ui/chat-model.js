// Per-chat answer model: a compact picker next to the microphone. Empty value = default from settings.
(()=>{
 const wrap=document.createElement('label');wrap.className='chat-model';wrap.title='Модель для ответов в этом чате';
 const select=document.createElement('select');select.setAttribute('aria-label','Модель для ответов в этом чате');
 wrap.append(select);
 const size=n=>n>=1e9?(n/1e9).toLocaleString('ru-RU',{maximumFractionDigits:1})+' ГБ':n?Math.round(n/1e6)+' МБ':'';
 let loading=0;
 async function refresh(){
  const epoch=++loading;let state;
  try{state=await window.petya.chatModels();}catch{state={models:[],current:'',defaultModel:'',error:'Ollama недоступна'};}
  if(epoch!==loading)return;
  const options=[new Option('Модель: '+(state.defaultModel||'по умолчанию'),'')];options[0].title='По умолчанию из «Подключения → Ollama»';
  for(const m of state.models){if(m.name===state.defaultModel)continue;const o=new Option(m.name+(m.size?' · '+size(m.size):''),m.name);options.push(o);}
  if(state.current&&!state.models.some(m=>m.name===state.current))options.push(new Option(state.current+' · не найдена',state.current));
  select.replaceChildren(...options);select.value=state.current||'';
  select.disabled=!state.models.length&&!state.current;wrap.title=state.error||'Модель для ответов в этом чате';
  wrap.dataset.custom=state.current?'true':'';
 }
 select.onchange=async()=>{const value=select.value;try{const r=await window.petya.chatModelSet(value);wrap.dataset.custom=r.current?'true':'';notice(r.current?'В этом чате отвечает '+r.current+'.':'В этом чате отвечает модель по умолчанию.');}catch(e){notice(e.message,true);refresh();}};
 select.onfocus=()=>refresh();
 function place(){const mic=document.querySelector('#home .mic-control');if(mic&&wrap.previousElementSibling!==mic)mic.after(wrap);}
 document.addEventListener('petya-topic-changed',()=>{place();refresh();});
 window.addEventListener('focus',()=>refresh());
 place();refresh();
 new MutationObserver(place).observe(document.getElementById('home')||document.body,{childList:true,subtree:true});
})();
// Agents UI ships next to the model picker until it gets its own <script> tag in index.html.
(()=>{const s=document.createElement('script');s.src='agent-plan.js';document.body.append(s);})();
