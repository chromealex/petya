// «Генератор уровней» in the notification center: the engine download and bot-match balance checks arrive on the
// shared extension progress channel; this adds «Отменить» while they run and restores them after a reload.
(()=>{
 const call=(method,...args)=>window.petya.feature('rtsLevels',method,...args);
 const show=item=>{
  if(!item||!/^rts-levels-(?:engine$|balance:)/.test(item.id||''))return;
  const {id,...data}=item;
  const stop=id==='rts-levels-engine'?()=>call('cancelDownload'):()=>call('cancelBalance',id.slice('rts-levels-balance:'.length));
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:data.busy?[['Отменить',stop]]:[]}}));
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('progress').then(items=>(items||[]).forEach(show)).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
