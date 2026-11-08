// «Конкуренты» in the notification center: Google Play facts are looked up through the web search, which can take a
// while; its progress arrives on the shared extension progress channel. This restores the last state after a reload.
(()=>{
 const restore=()=>window.petya.feature('competitors','progress').then(item=>{
  if(item?.id!=='competitors-refresh')return;
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{...item,actions:[]}}));
 }).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
