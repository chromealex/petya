// Startup splash: Petya (layers from assets/boot) hops, laughs, blinks and tips his cap while the window opens,
// then flies into the logo in the app chrome — or into window.petyaBootSplash.target (the first-run introduction).
// A window started hidden (tray) drops the splash silently: by the time it is opened the app is ready.
(()=>{
 const splash=document.getElementById('boot-splash');if(!splash)return;
 const MIN_VISIBLE=1600,WAIT_FOR_SHOW=1200,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const lines=['Протираю глаза','Поправляю фуражку','Вспоминаю, о чём говорили'],caption=splash.querySelector('.boot-caption');
 let line=0,shownAt=0,done=false;caption.textContent=lines[0]+'…';
 const ticker=setInterval(()=>{line=(line+1)%lines.length;caption.textContent=lines[line]+'…';},650);
 const remove=()=>{if(done)return;done=true;clearInterval(ticker);clearTimeout(safety);splash.remove();document.documentElement.classList.remove('boot-landing');if(api.target)api.target.style.opacity='';};
 const safety=setTimeout(remove,9000);
 const fade=(el,options)=>el.animate([{opacity:getComputedStyle(el).opacity},{opacity:0}],{fill:'forwards',easing:'ease',...options});
 function leave(){
  if(done)return;
  const fly=splash.querySelector('.boot-fly'),target=api.target,logo=target||document.querySelector('.app-chrome .brand .logo');
  const from=fly.getBoundingClientRect(),to=logo?.getBoundingClientRect();
  if(reduce||!to?.width||!from.width){fade(splash,{duration:reduce?150:350}).finished.then(remove,remove);return;}
  document.documentElement.classList.add('boot-landing');if(target)target.style.opacity='0';
  fly.style.animation='none';splash.classList.add('boot-flying');
  const dx=to.left+to.width/2-(from.left+from.width/2),dy=to.top+to.height/2-(from.top+from.height/2),scale=to.width/from.width;
  for(const el of splash.querySelectorAll('.boot-title,.boot-caption,.boot-ring,.boot-glow,.boot-shadow'))fade(el,{duration:220});
  fade(splash.querySelector('.boot-backdrop'),{duration:430,delay:170});
  fly.animate([
   {transform:'none'},
   {transform:'translate('+dx*.3+'px,'+(dy*.3-60)+'px) scale('+((1+scale)/2)+') rotate(-12deg)',offset:.45},
   {transform:'translate('+dx+'px,'+dy+'px) scale('+scale+')'}
  ],{duration:640,easing:'cubic-bezier(.45,0,.2,1)',fill:'forwards'}).finished.then(()=>{
   remove();if(target){target.style.opacity='';return;}logo.animate([{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:280,easing:'ease-out'});
  },remove);
 }
 // The introduction sets a landing target, or dismisses the splash when it resumes after a restart.
 const api=window.petyaBootSplash={target:null,dismiss(){if(!done)fade(splash,{duration:200}).finished.then(remove,remove);}};
 const markShown=()=>{if(!shownAt)shownAt=performance.now();};
 window.petyaEvents?.onWindowShown(markShown);
 window.addEventListener('load',async()=>{
  let visible=false;try{visible=await window.petya.feature('bootSplash','visible');}catch{}
  // Already on screen without a show event: a reload (company switch) or the show event is still on its way.
  if(visible&&!shownAt)shownAt=Math.max(0,performance.now()-MIN_VISIBLE/2);
  if(!shownAt)await new Promise(resolve=>{const timer=setTimeout(resolve,WAIT_FOR_SHOW);window.petyaEvents?.onWindowShown(()=>{clearTimeout(timer);resolve();});});
  if(!shownAt||done)return remove();
  setTimeout(leave,Math.max(0,shownAt+MIN_VISIBLE-performance.now()));
 });
})();
