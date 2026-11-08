// «Зависимости» in the notification center: the check's stages arrive on the shared extension progress channel;
// this restores the current state after a reload or when the window is shown again.
(()=>{
 const restore=()=>window.petya.feature('dependencies','progress').then(item=>{if(item)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:item}));}).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
