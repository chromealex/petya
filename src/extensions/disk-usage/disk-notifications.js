// «Место на диске» in the notification center: the scan's stages arrive on the shared extension progress channel
// (the center shows them); this adds «Остановить» while a scan runs and restores the state after a reload.
(()=>{
 const call=(method,...args)=>window.petya.feature('diskUsage',method,...args);
 const show=item=>{
  if(item?.id!=='disk-usage-scan')return;
  const {id,...data}=item;
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:data.busy?[['Остановить',()=>call('cancel')]]:[]}}));
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('progress').then(show).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
