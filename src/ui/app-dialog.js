// Petya's own dialogs instead of the system ones: confirmations from the interface (window.petyaConfirm) and
// questions from the main process (src/app-dialog.cjs → showMessageBox), in the app's style. Enter picks the
// default button, Esc the cancel one. See AGENTS.md → «Interface rules».
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined&&text!==null)n.textContent=text;return n;};
 const DANGER=/^(Удалить|Стереть|Забыть|Очистить|Сбросить|Отключить|Выйти)/;
 let open=Promise.resolve();
 // ask({message, detail, buttons:[label…], defaultId, cancelId, danger:index}) → index of the pressed button.
 function ask({message='',detail='',buttons=['OK'],defaultId=0,cancelId=-1,danger=-1}={}){
  const run=()=>new Promise(resolve=>{
   const dialog=el('dialog','app-dialog'),face=el('img','app-dialog-face'),text=el('div','app-dialog-text');
   face.src='../../assets/app-icon.png';face.alt='';
   const title=el('h2','app-dialog-title',message);title.id='app-dialog-title-'+Date.now();dialog.setAttribute('aria-labelledby',title.id);text.append(title);
   if(detail)text.append(el('p','app-dialog-detail',detail));
   const row=el('div','app-dialog-actions');
   const cancel=cancelId>=0?cancelId:buttons.length>1?buttons.length-1:0;
   // The cancel button stands first (left), the others follow; the default one is primary (red when it destroys).
   const order=[cancel,...buttons.map((_,i)=>i).filter(i=>i!==cancel)];
   let done=false;const finish=i=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(i);};
   for(const i of order){const b=el('button',null,buttons[i]);b.type='button';b.dataset.index=String(i);
    if(i===defaultId&&i!==cancel)b.className=i===danger||DANGER.test(buttons[i])?'app-dialog-danger':'primary';
    b.onclick=()=>finish(i);row.append(b);}
   dialog.addEventListener('cancel',e=>{e.preventDefault();finish(cancel);});
   dialog.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!(e.target instanceof HTMLTextAreaElement)){e.preventDefault();finish(defaultId);}});
   dialog.append(face,text,row);document.body.append(dialog);dialog.showModal();
   (row.querySelector('[data-index="'+defaultId+'"]')||row.lastElementChild)?.focus();
  });
  // One at a time: a second question waits for the first answer.
  const next=open.then(run,run);open=next.catch(()=>{});return next;
 }
 // confirm(): «Удалить …?» gets a red «Удалить»; returns true/false.
 async function confirm(message,{detail='',ok='',cancel='Отмена',danger}={}){
  const text=String(message||''),word=text.match(DANGER)?.[1]||'';
  const yes=ok||word||'OK',red=danger??!!word;
  return (await ask({message:text,detail,buttons:[yes,cancel],defaultId:0,cancelId:1,danger:red?0:-1}))===0;
 }
 window.petyaAsk=ask;window.petyaConfirm=confirm;
 // The main process asks through here instead of a system message box.
 window.petyaEvents?.onAppDialog?.(async request=>{const response=await ask(request);window.petya.feature('appDialog','answer',request.id,response).catch(()=>{});});
 window.petya?.feature?.('appDialog','ready').catch(()=>{});
})();
