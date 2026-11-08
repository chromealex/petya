// The semantic index in the notification center: its cards arrive on the shared extension progress channel without
// functions; this adds «Пауза» / «Продолжить» while indexing, «Отменить» while the model downloads and «Скачать
// модель» after a missing-model error, and restores the cards after a window reload.
(()=>{
 const call=(method,...args)=>window.petya.feature('semanticIndex',method,...args);
 const show=item=>{
  if(!item||!/^semantic-index(?:-model)?$/.test(item.id||''))return;
  const {id,...data}=item;
  let actions=[];
  if(id==='semantic-index-model')actions=data.busy?[['Отменить',()=>call('cancelModel')]]:data.kind==='error'?[['Повторить',()=>call('prepareModel')]]:[];
  else if(data.paused)actions=[['Продолжить',()=>call('resume')]];
  else if(data.busy)actions=[['Пауза',()=>call('pause')]];
  else if(data.code==='model')actions=[['Скачать модель',()=>call('prepareModel')]];
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions}}));
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('progress').then(items=>(items||[]).forEach(show)).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
