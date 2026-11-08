(()=>{
 const show=item=>{if(item)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:item}));};
 window.petyaEvents.onCoderProgress?.(show);
 window.petya.feature('coder','progress').then(show).catch(()=>{});
})();
