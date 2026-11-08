// «Фокус» in Petya's chrome: a small timer next to the notification bell while a session runs (click opens the
// notification center), and the session's notification card with «Пауза», «Стоп», «Ещё 10 минут». The state
// comes from the main process on the shared extension progress channel and is re-read when the window is shown;
// cards in the chat listen to the `petya-focus` event to keep their ring timer live.
(()=>{
 const call=(method,...args)=>window.petya.feature('focusApp',method,...args);
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('focus-chrome.css',document.currentScript.src).href;document.head.append(style);
 const NS='http://www.w3.org/2000/svg';
 const pill=document.createElement('button');pill.type='button';pill.className='focus-pill';pill.hidden=true;
 const ring=document.createElementNS(NS,'svg');ring.setAttribute('viewBox','0 0 20 20');ring.setAttribute('width','16');ring.setAttribute('height','16');ring.setAttribute('aria-hidden','true');
 const track=document.createElementNS(NS,'circle'),arc=document.createElementNS(NS,'circle');
 for(const c of [track,arc]){c.setAttribute('cx','10');c.setAttribute('cy','10');c.setAttribute('r','8');c.setAttribute('fill','none');c.setAttribute('stroke-width','2.4');}
 track.setAttribute('class','focus-pill-track');arc.setAttribute('class','focus-pill-arc');arc.setAttribute('transform','rotate(-90 10 10)');
 const C=2*Math.PI*8;arc.setAttribute('stroke-dasharray',String(C));ring.append(track,arc);
 const time=document.createElement('span');time.className='focus-pill-time';
 const label=document.createElement('span');label.className='focus-pill-label';label.dataset.noI18n='';
 pill.append(ring,time,label);
 const place=()=>{if(pill.isConnected)return;const anchor=document.querySelector('.notification-bell')||document.getElementById('company-manage');anchor?.before(pill);};
 place();
 pill.onclick=()=>document.querySelector('.notification-bell')?.click();
 let status=null,offset=0;
 const remaining=a=>a.state==='paused'?a.remaining:Math.max(0,a.endsAt-(Date.now()-offset));
 const clock=ms=>{const s=Math.ceil(ms/1000),m=Math.floor(s/60);return m>=60?Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
 function paint(){
  const a=status?.active;place();
  pill.hidden=!a;if(!a)return;
  const left=remaining(a);
  time.textContent=clock(left);
  label.textContent=a.kind==='break'?window.t?.('перерыв')||'перерыв':(a.label||a.jira||'');
  label.hidden=!label.textContent;
  arc.setAttribute('stroke-dashoffset',String(C*(1-Math.min(1,left/a.planned))));
  pill.dataset.kind=a.kind;pill.dataset.state=a.state;
  const what=a.kind==='break'?'Перерыв':'Фокус';
  pill.title=what+(a.state==='paused'?' на паузе':'')+': осталось '+clock(left)+(a.label?' · '+a.label:'');
  pill.setAttribute('aria-label',pill.title);
 }
 setInterval(()=>{if(status?.active)paint();},1000);
 const notify=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 const run=fn=>async()=>{const r=await fn();if(r){status=r;offset=Date.now()-r.now;paint();window.petyaFocusState=r;document.dispatchEvent(new CustomEvent('petya-focus',{detail:r}));}const item=await call('item');show(item);};
 function actions(item){
  const a=item.focus?.active;
  if(a?.kind==='focus')return a.state==='paused'?[['Продолжить',run(()=>call('resume'))],['Стоп',run(()=>call('stop'))]]:[['Пауза',run(()=>call('pause'))],['Стоп',run(()=>call('stop'))],['Ещё 10 минут',run(()=>call('extend',10))]];
  if(a?.kind==='break')return [['Ещё 5 минут',run(()=>call('extend',5))],['Закончить перерыв',run(()=>call('stop'))]];
  if(item.ended==='focus')return [['Перерыв 5',run(()=>call('breakNow',5))]];
  return [];
 }
 function show(item){
  if(!item||item.id!=='focus-session')return;
  if(item.focus){status=item.focus;offset=Date.now()-item.focus.now;}
  else if(item.ended||item.version==='idle')status={active:null,held:0,now:Date.now()};
  paint();
  window.petyaFocusState=status;
  document.dispatchEvent(new CustomEvent('petya-focus',{detail:status}));
  if(item.version==='idle')return;
  const {id,...data}=item;notify({id,...data,actions:actions(item)});
 }
 window.petyaEvents?.onExtensionInstall?.(show);
 const restore=()=>call('item').then(show).catch(()=>{});
 window.petyaEvents?.onWindowShown?.(restore);restore();
})();
