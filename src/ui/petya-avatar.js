// Petya as a living character built from the layers in assets/boot (see scripts/split-petya-layers.py).
// PetyaAvatar.create() returns { el, mood(name), source(id) }: moods idle, talk, guess, found, miss; source()
// shows the place being checked inside the magnifying glass while Petya guesses.
(()=>{
 const ASSETS='../../assets/boot/petya-';
 const ICONS={
  system:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  browser:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  git:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 5-6 4-12 8"/>',
  slack:'<path d="M9 3 7 21M17 3l-2 18M4 8h17M3 16h17"/>',
  apps:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  projects:'<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'
 };
 const LENS='<svg viewBox="0 0 48 48" aria-hidden="true"><line x1="27" y1="27" x2="42" y2="42" stroke="#3a2b1a" stroke-width="7" stroke-linecap="round"/><line x1="27" y1="27" x2="42" y2="42" stroke="#c8913a" stroke-width="4" stroke-linecap="round"/><circle cx="17" cy="17" r="13" fill="#1b2a22cc" stroke="#f0f2ed" stroke-width="4"/><path d="M9 12a9 9 0 0 1 6-5" fill="none" stroke="#fff8" stroke-width="2" stroke-linecap="round"/></svg>';
 const SPARKS=[[-60,-50],[60,-55],[-75,5],[78,0],[-40,-85],[42,-88]];
 function create({size}={}){
  const el=document.createElement('div');el.className='pa';el.dataset.mood='idle';el.setAttribute('aria-hidden','true');
  if(size)el.style.setProperty('--pa-size',size+'px');
  const img=(name,cls)=>{const i=document.createElement('img');i.src=ASSETS+name+'.png';i.alt='';i.draggable=false;if(cls)i.className=cls;return i;};
  const glow=document.createElement('span');glow.className='pa-glow';
  const shadow=document.createElement('span');shadow.className='pa-shadow';
  const figure=document.createElement('div');figure.className='pa-figure';
  const head=document.createElement('div');head.className='pa-head';
  head.append(img('head'),img('mouth','pa-mouth'),img('eye-l','pa-eye pa-eye-l'),img('eye-r','pa-eye pa-eye-r'),img('cap','pa-cap'));
  figure.append(img('body'),head);
  const orbit=document.createElement('div');orbit.className='pa-orbit';
  const lens=document.createElement('div');lens.className='pa-lens';lens.innerHTML=LENS;
  const icon=document.createElement('div');icon.className='pa-lens-icon';lens.append(icon);orbit.append(lens);
  const bubble=document.createElement('div');bubble.className='pa-bubble';bubble.innerHTML='<i></i><i></i><i></i>';
  const sparks=document.createElement('div');sparks.className='pa-sparks';
  for(const [x,y] of SPARKS){const s=document.createElement('i');s.style.setProperty('--x',x+'px');s.style.setProperty('--y',y+'px');sparks.append(s);}
  el.append(glow,shadow,figure,orbit,sparks,bubble);
  let timer;
  return {el,figure,
   // found, miss and talk play once and settle back to idle; guess lasts until the next mood.
   mood(name){clearTimeout(timer);el.dataset.mood='';void el.offsetWidth;el.dataset.mood=name;
    if(name==='found'||name==='talk')timer=setTimeout(()=>{el.dataset.mood='idle';},name==='found'?1100:950);
    if(name==='miss')timer=setTimeout(()=>{el.dataset.mood='idle';},2200);},
   source(id){const svg=ICONS[id];icon.innerHTML=svg?'<svg viewBox="0 0 24 24">'+svg+'</svg>':'';icon.classList.remove('pop');void icon.offsetWidth;icon.classList.add('pop');}
  };
 }
 window.PetyaAvatar={create};
})();
