// Appearance (src/appearance.cjs): applies the theme before the first paint — light / dark / as the system, the
// preset's tokens and the accent — and follows changes from the settings card and the system's colour scheme.
(()=>{
 const root=document.documentElement;
 const system=matchMedia('(prefers-color-scheme: dark)');
 let state=window.petyaAppearance||null;
 const TOKENS=['--bg','--panel','--panel-2','--hover','--line','--ink','--muted','--on','--accent','--on-accent','--ok','--warn','--alert','--info','--violet'];
 function apply(next){
  if(next)state=next;if(!state)return;
  const dark=state.mode==='dark'||state.mode==='system'&&system.matches,theme=dark?'dark':'light';
  root.dataset.theme=theme;root.dataset.textSize=state.size||'normal';
  for(const t of TOKENS)root.style.removeProperty(t);
  for(const [t,v] of Object.entries(state.tokens?.[theme]||{}))root.style.setProperty(t,v);
  document.dispatchEvent(new CustomEvent('petya-appearance',{detail:{theme,state}}));
 }
 apply();
 system.addEventListener('change',()=>apply());
 window.petyaEvents?.onAppearance?.(apply);
 window.petyaAppearanceState=()=>state;
 window.applyAppearance=apply;
})();
