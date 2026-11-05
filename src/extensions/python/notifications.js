(()=>{
 const show=item=>{if(item)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:item}));};
 window.petyaEvents.onPythonProgress(show);
 window.petya.feature('python','progress').then(show).catch(()=>{});
})();
