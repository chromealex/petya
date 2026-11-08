// «Docker» in the notification center: start/stop/restart, compose up/down and removing images arrive on the shared
// extension progress channel (the center shows them); this restores the current operation after a reload.
(()=>{
 const show=item=>{
  if(item?.id!=='docker-operation')return;
  const {id,...data}=item;
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:[]}}));
 };
 const restore=()=>window.petya.feature('dockerApp','progress').then(show).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
