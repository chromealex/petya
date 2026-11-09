// Appearance of Petya's windows: light / dark / as the system, a preset per mode, an accent colour and the text
// size. App-wide (like the interface language), kept in userData/appearance.json. The presets are the tokens of
// src/ui/theme.css; the renderer (src/ui/appearance.js) applies them on `<html data-theme>` before the first paint.
const fs=require('node:fs'),path=require('node:path');
const MODES=['system','light','dark'],SIZES=['compact','normal','large'];
// id, name, which mode it belongs to, and the tokens that differ from the mode's base.
const PRESETS=[
 {id:'forest',name:'Лес',mode:'dark',tokens:{}},
 {id:'graphite',name:'Графит',mode:'dark',tokens:{'--bg':'#131416','--panel':'#1b1d20','--panel-2':'#222529','--hover':'#2a2e33','--line':'#33383e','--accent':'#9ec5ff','--on-accent':'#0f1a2a'}},
 {id:'ocean',name:'Океан',mode:'dark',tokens:{'--bg':'#0f1620','--panel':'#16202c','--panel-2':'#1c2735','--hover':'#243141','--line':'#2c3b4d','--accent':'#5cc8ff','--on-accent':'#06202e','--ink':'#eef4fa','--muted':'#93a4b8'}},
 {id:'sunset',name:'Закат',mode:'dark',tokens:{'--bg':'#171311','--panel':'#211b18','--panel-2':'#29211d','--hover':'#332924','--line':'#3d322c','--accent':'#ffb36b','--on-accent':'#2b1708','--ink':'#f5efe9','--muted':'#a69a90'}},
 {id:'snow',name:'Снег',mode:'light',tokens:{}},
 {id:'paper',name:'Бумага',mode:'light',tokens:{'--bg':'#f6f2ea','--panel':'#fffdf8','--panel-2':'#f1ece2','--hover':'#ebe4d6','--line':'#dfd6c5','--accent':'#8a6a2a','--on-accent':'#fffaf0','--ink':'#2a241c','--muted':'#6f665a'}},
 {id:'mint',name:'Мята',mode:'light',tokens:{'--bg':'#eef5f1','--panel':'#ffffff','--panel-2':'#e4efe9','--hover':'#d9e8e0','--line':'#c9dbd2','--accent':'#1f7a5c','--on-accent':'#f2fbf7','--ink':'#15241e','--muted':'#5b6e66'}}
];
const DEFAULT={mode:'system',dark:'forest',light:'snow',accent:'',size:'normal'};
const HEX=/^#[0-9a-f]{6}$/i;
function clean(value){
 const v=value&&typeof value==='object'?value:{};
 return {mode:MODES.includes(v.mode)?v.mode:'system',
  dark:PRESETS.some(p=>p.id===v.dark&&p.mode==='dark')?v.dark:'forest',
  light:PRESETS.some(p=>p.id===v.light&&p.mode==='light')?v.light:'snow',
  accent:HEX.test(String(v.accent||''))?String(v.accent).toLowerCase():'',
  size:SIZES.includes(v.size)?v.size:'normal'};
}
function electronApp(){try{const e=require('electron');return typeof e==='object'?e.app:null;}catch{return null;}}
function file(app=electronApp()){return app?path.join(app.getPath('userData'),'appearance.json'):null;}
function read(app=electronApp()){try{return clean(JSON.parse(fs.readFileSync(file(app),'utf8')));}catch{return {...DEFAULT};}}
function write(value,app=electronApp()){const next=clean(value);const f=file(app);if(f){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(next));}return next;}
// Dark text on a light accent, light text on a dark one (a custom accent has no hand-picked pair).
function onAccent(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return (0.2126*r+0.7152*g+0.0722*b)/255>0.55?'#14201a':'#ffffff';}
// What a window applies: the mode to resolve against the system, both presets' tokens, the accent and size.
function bootstrap(app=electronApp()){
 const state=read(app);
 const tokens=mode=>({...(PRESETS.find(p=>p.id===state[mode])?.tokens||{}),...(state.accent?{'--accent':state.accent,'--on-accent':onAccent(state.accent)}:{})});
 return {...state,tokens:{dark:tokens('dark'),light:tokens('light')},presets:PRESETS.map(({id,name,mode,tokens})=>({id,name,mode,preview:{bg:tokens['--bg']||(mode==='dark'?'#111415':'#f4f6f3'),panel:tokens['--panel']||(mode==='dark'?'#1b1f20':'#ffffff'),accent:tokens['--accent']||(mode==='dark'?'#d0f596':'#3f7d17'),ink:tokens['--ink']||(mode==='dark'?'#f0f2ed':'#15201a')}}))};
}
module.exports={MODES,SIZES,PRESETS,DEFAULT,clean,read,write,bootstrap,onAccent};
