// Replaces hard-coded colours in the stylesheets with the theme tokens of src/ui/theme.css, so the appearance
// setting (light/dark/presets, accent) reaches every screen. Run after adding styles with literal colours:
//   node scripts/theme-tokens.cjs          — rewrites src/ui/*.css and src/extensions/*/*.css
//   node scripts/theme-tokens.cjs --check  — lists colours that still should be tokens (used by tests)
// Solid white and black, shadows (#000 with alpha) and the rare saturated tints stay as they are.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const SEMANTIC={c9ed9d:'ok',d0f596:'accent',d2f79b:'accent',e5ce8c:'warn',e8d39a:'warn',efc878:'warn',e8bc65:'warn',f0b4a8:'alert',f0c9a8:'alert',
 '86c2ff':'info','9cc3f0':'info','7fb2e5':'info','86a8e0':'info','9cb0f0':'info','9fb2ee':'info','8fb3e6':'info','7fb3d5':'info',b9d6f2:'info',a9cdf2:'info','8fb3e0':'info',a9d3ff:'info',
 c9b8ef:'violet',b9a6e6:'violet',c9a8f0:'violet','172216':'on-accent'};
const hsl=hex=>{const r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,s=max===min?0:(max-min)/(1-Math.abs(2*l-1));return {l,s};};
// The token a colour stands for, or '' when it stays literal.
function tokenOf(rgb){
 if(SEMANTIC[rgb])return SEMANTIC[rgb];
 if(rgb==='ffffff'||rgb==='000000')return '';
 const {l,s}=hsl(rgb);
 if(s>0.3)return '';
 if(l>=0.82)return 'ink';
 if(l>=0.4&&l<0.75&&s<0.12)return 'muted';
 if(l<0.3){if(l<=0.09)return 'bg';if(l<=0.13)return 'panel';if(l<=0.165)return 'panel-2';if(l<=0.215)return 'hover';return 'line';}
 return '';
}
const expand=h=>h.length<=4?[...h].map(c=>c+c).join(''):h;
function rewrite(css){
 return css.replace(/#([0-9a-fA-F]{3,8})\b/g,(m,raw)=>{
  if(![3,4,6,8].includes(raw.length))return m;
  const h=expand(raw).toLowerCase(),rgb=h.slice(0,6),alpha=h.slice(6);
  const pct=alpha?Math.max(1,Math.round(parseInt(alpha,16)/255*100)):100;
  if(rgb==='ffffff'&&alpha)return `color-mix(in srgb,var(--on) ${pct}%,transparent)`;
  const token=tokenOf(rgb);if(!token)return m;
  return alpha&&pct<100?`color-mix(in srgb,var(--${token}) ${pct}%,transparent)`:`var(--${token})`;
 });
}
function files(){
 const out=fs.readdirSync(path.join(root,'src/ui')).filter(f=>f.endsWith('.css')&&f!=='theme.css').map(f=>'src/ui/'+f);
 for(const e of fs.readdirSync(path.join(root,'src/extensions'),{withFileTypes:true}))if(e.isDirectory())for(const f of fs.readdirSync(path.join(root,'src/extensions',e.name)))if(f.endsWith('.css')&&!(e.name==='meeting-hints'&&f==='panel.css'))out.push('src/extensions/'+e.name+'/'+f);// the hints panel is its own window with its own tokens
 return out;
}
function check(){
 const found=[];
 for(const f of files()){const css=fs.readFileSync(path.join(root,f),'utf8');for(const m of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)){const raw=m[1];if(![3,4,6,8].includes(raw.length))continue;const h=expand(raw).toLowerCase(),rgb=h.slice(0,6);if(rgb==='ffffff'&&h.length>6||tokenOf(rgb))found.push(f+': #'+raw);}}
 return found;
}
if(require.main===module){
 if(process.argv.includes('--check')){const found=check();for(const line of found)console.log(line);console.log(found.length+' literal colours');process.exitCode=found.length?1:0;}
 else{let changed=0;for(const f of files()){const file=path.join(root,f),css=fs.readFileSync(file,'utf8'),next=rewrite(css);if(next!==css){fs.writeFileSync(file,next);changed++;}}console.log('rewritten files: '+changed);}
}
module.exports={rewrite,tokenOf,check,files};
