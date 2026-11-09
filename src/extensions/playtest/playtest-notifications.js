// «Разбор плейтеста» in the notification center: runs arrive on the shared extension progress channel; this adds
// «Отменить» while a run is busy and restores active runs after a reload.
(()=>{
 const call=(method,...args)=>window.petya.feature('playtestApp',method,...args);
 const show=item=>{
  if(!item||!/^playtest:/.test(item.id||''))return;
  const {id,...data}=item;
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:data.busy?[['Отменить',()=>call('cancel',id.slice('playtest:'.length))]]:[]}}));
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('progress').then(items=>(items||[]).forEach(show)).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
