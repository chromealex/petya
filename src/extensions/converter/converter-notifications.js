// «Конвертер» in the notification center: runs and the ffmpeg download arrive on the shared extension progress
// channel; this adds «Отменить» while they run and restores them after a reload.
(()=>{
 const call=(method,...args)=>window.petya.feature('converter',method,...args);
 const show=item=>{
  if(!item||!/^converter(?::|-ffmpeg$)/.test(item.id||''))return;
  const {id,...data}=item;
  const stop=id==='converter-ffmpeg'?()=>call('cancelDownload'):()=>call('cancel',id.slice('converter:'.length));
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:data.busy?[['Отменить',stop]]:[]}}));
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('progress').then(items=>(items||[]).forEach(show)).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
