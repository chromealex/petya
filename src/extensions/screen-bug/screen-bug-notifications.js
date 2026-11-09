// «Запись экрана → баг» in the notification center: «Остановить» while a recording runs, the state restored after a
// reload. When a recording is ready, the chat opens its bug draft with the ordinary request (once per recording).
(()=>{
 const call=(method,...args)=>window.petya.feature('screenBug',method,...args);
 const opened=new Set();
 const show=item=>{
  if(item?.id!=='screen-bug-recording')return;
  const {id,recording,ready,...data}=item;
  document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id,...data,actions:data.busy?[['Остановить',()=>call('stop')]]:[]}}));
  document.dispatchEvent(new CustomEvent('petya-screen-bug',{detail:item}));
  if(ready&&recording&&!opened.has(recording)){
   opened.add(recording);
   if(typeof view==='function')view('home');
   (window.resultKit?.ask?.('оформи баг по записи экрана',{send:true})||Promise.resolve()).catch(e=>window.resultKit?.toast?.(e.message,{error:true}));
  }
 };
 window.petyaEvents?.onExtensionInstall?.(show);
 // After a reload only the state comes back; a finished recording is not opened twice.
 const restore=()=>call('progress').then(item=>{if(item?.recording)opened.add(item.recording);show(item);}).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
