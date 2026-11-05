(()=>{
 function artist(state) {
   if (!state || state.phase === 'idle') return;
   document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'artist', title: 'Художник', text: state.message, busy: state.busy, version: state.phase,
     percent: state.percent, kind: state.phase === 'error' ? 'error' : 'model',
     actions: state.busy ? [['Остановить', () => window.petya.feature('artist', 'stop')]] : [] }}));
 }
 window.petyaEvents.onArtistProgress(artist);
 window.petya.feature('artist', 'status').then(artist).catch(()=>{});
})();
