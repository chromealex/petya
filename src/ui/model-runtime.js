// Subscribe independently of the settings view and recover the owner's current state.
(()=>{
 const invoke=method=>window.petya.feature('modelRuntime',method).then(show);
 function show(state){
  if(!state||state.phase==='idle')return;
  const actions=[];
  if(['starting','ready'].includes(state.phase))actions.push([state.phase==='starting'?'Отменить':'Остановить',()=>invoke('stop')]);
  if(['error','stopped'].includes(state.phase)&&state.releaseAvailable)actions.push(['Повторить запуск',()=>invoke('start')]);
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'petya-model-runtime',title:'Модель Пети',text:state.message,busy:state.busy,percent:state.percent,version:state.version,kind:state.phase==='error'?'error':state.phase==='ready'?'success':'info',actions}}));
 }
 window.petyaEvents.onModelRuntime(show);
 window.petya.feature('modelRuntime','status').then(show).catch(()=>{});
})();
