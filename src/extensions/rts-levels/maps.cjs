// «Генератор уровней»: a map draft driven through rtsmcp. A draft is a recipe — the project, the template map,
// map_generate arguments, the river and teams drawn after generation, and the edits — so it can be rebuilt
// exactly (the generator is deterministic) whenever rtsmcp was restarted or another draft was open. Nothing is
// written to the project until save(): the draft lives in rtsmcp's own in-memory document.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

// map_validate always flags the generator's own summary block; it is not a problem of the user's map.
const NOISE=/^map\.generated: unknown key/;
const RESOURCE=/(?:mine|ore|gold|crystal|spice|metal|oil|gem|deposit|resource|mineral|vein|well|руд|рудник|шахт|золот|кристал|месторожд)/i;
const TREE=/(?:tree|forest|wood|bush|дерев|лес|куст)/i;

async function templateMap(mcp){
 const list=await mcp.call('map_list',{});
 return list?.inGame?.[0]?.file||list?.files?.[0]||'';
}
// Opens the project and the map whose start kit and neutral objects the generator copies.
async function open(mcp,draft){
 await mcp.call('open_game',{game:draft.folder});
 if(draft.template===undefined)draft.template=await templateMap(mcp);
 if(draft.template)await mcp.call('map_open',{file:draft.template});
 else await mcp.call('map_new',{width:64,height:64,name:draft.title||'Новая карта'});
}
// Who plays together: the first team on the left (or top) side of the split.
function teamsOf(starts,teams,axis='x'){
 if(!teams||!starts?.length)return null;
 const order=starts.map((s,i)=>({i,a:axis==='y'?s[1]:s[0],b:axis==='y'?s[0]:s[1]})).sort((p,q)=>p.a-q.a||p.b-q.b);
 const out=new Array(starts.length).fill(2);
 order.slice(0,teams[0]).forEach(p=>{out[p.i]=1;});
 return out;
}
const riverAxis=draft=>draft.gen.symmetry==='mirror-y'?'y':'x';
// The river through the middle: neutral objects in its bed go, the bed is level 0 water, fords are shallows.
function riverCalls(size,river,axis='x'){
 const [w,h]=size,long=axis==='x'?h:w,across=axis==='x'?w:h;
 const a=Math.max(0,Math.floor(across/2-river.width/2)),b=Math.min(across-1,a+river.width-1);
 const rect=axis==='x'?[a,0,b,long-1]:[0,a,long-1,b];
 const calls=[['entity_delete',{all:true,owner:0,rect}],['terrain_level',{level:0,rect}],['terrain_paint',{kind:'water',rect}]];
 const half=Math.max(1,Math.round(river.width/2));
 for(let i=1;i<=river.fords;i++){
  const c=Math.round(long*i/(river.fords+1));
  calls.push(['terrain_paint',{kind:'shallow',rect:axis==='x'?[a,c-half,b,c+half-1]:[c-half,a,c+half-1,b]}]);
 }
 return calls;
}
async function run(mcp,calls){for(const [name,args] of calls)await mcp.call(name,args);}

// Builds the draft from its recipe in the open rtsmcp session. Returns map_generate's report.
async function build(mcp,draft){
 await open(mcp,draft);
 const generated=await mcp.call('map_generate',{...draft.gen,useTemplate:!!draft.template});
 draft.generated=generated?.generated||null;
 draft.size=generated?.size||draft.size;
 const starts=draft.generated?.starts||[];
 if(draft.teams){
  const plan=teamsOf(starts,draft.teams,riverAxis(draft));
  if(plan)await run(mcp,plan.map((team,i)=>['map_set',{path:'players['+i+'].team',value:team}]));
 }
 if(draft.river)await run(mcp,riverCalls(draft.size,draft.river,riverAxis(draft)));
 await mcp.call('map_set',{path:'name',value:draft.title});
 for(const edit of draft.edits||[])if(edit.calls)await run(mcp,edit.calls);
 return generated;
}

// ---- what the card shows ---------------------------------------------------------------------------------------
function parseAscii(text){
 const lines=String(text||'').split(/\r?\n/);
 const head=lines[0]?.startsWith('legend')?lines.shift():'';
 const scale=Number(/scale\s+1:(\d+)/.exec(head)?.[1])||1;
 const rows=lines.filter(l=>l.length&&!/^\s*$/.test(l));
 return {rows,scale};
}
function kinds(objects={}){
 const entries=Object.entries(objects).sort((a,b)=>b[1]-a[1]);
 const trees=entries.filter(([t])=>TREE.test(t)).map(([t])=>t);
 if(!trees.length&&entries.length>1&&entries[0][1]>40)trees.push(entries[0][0]);
 let resources=entries.filter(([t])=>RESOURCE.test(t)&&!trees.includes(t)).map(([t])=>t);
 if(!resources.length)resources=entries.filter(([t,n])=>!trees.includes(t)&&n<=64).map(([t])=>t);
 return {trees,resources};
}
function issuesOf(validation){
 const groups=new Map();
 for(const i of validation?.issues||[]){
  const text=String(i.text||'').trim();if(!text||NOISE.test(text))continue;
  const g=groups.get(text)||{text,error:!!i.error,count:0};g.count++;groups.set(text,g);
 }
 return [...groups.values()].sort((a,b)=>Number(b.error)-Number(a.error)||b.count-a.count).slice(0,12);
}
async function describe(mcp,draft){
 const [info,ascii,validation]=[await mcp.call('map_info',{}),await mcp.call('map_ascii',{maxWidth:160}),await mcp.call('map_validate',{})];
 const {rows,scale}=parseAscii(ascii?.text);
 const k=kinds(draft.generated?.objects);
 draft.kinds=k;
 let resources=[];
 for(const type of k.resources.slice(0,4)){
  const list=await mcp.call('entity_list',{type,owner:0});
  for(const e of list?.entities||[])resources.push([Math.round(e.x*10)/10,Math.round(e.z*10)/10]);
 }
 resources=resources.slice(0,400);
 const players=(info?.players||[]).map((p,i)=>({n:i+1,name:String(p.name||'Игрок '+(i+1)).slice(0,40),team:p.team??null,start:Array.isArray(p.start)?p.start:null}));
 const issues=issuesOf(validation);
 const hash=createHash('sha1').update(String(ascii?.text||'')).update(':'+(info?.entities||0)).digest('hex').slice(0,16);
 return {
  width:info?.width||draft.size?.[0]||0,height:info?.height||draft.size?.[1]||0,
  preview:{rows,scale,resources},players,issues,
  errors:issues.filter(i=>i.error).reduce((a,i)=>a+i.count,0),
  entities:info?.entities||0,hash,
  paths:(draft.generated?.paths||[]).map(([a,b,d])=>[a,b,Math.round(d)]),connected:draft.generated?.connected!==false,pathSpread:draft.generated?.pathSpread??null,
  objects:draft.generated?.objects||{}
 };
}

// ---- edits -----------------------------------------------------------------------------------------------------
const FREE=/[.1-9,/]/;
// The nearest free ground cell to (x, z) in map cells, from the ascii picture (no objects, no water, no rock).
function freeNear(view,x,z,taken){
 const {rows,scale}=view.preview;
 const gx=Math.round(x/scale),gz=Math.round(z/scale);
 for(let r=0;r<12;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
  const cx=gx+dx,cz=gz+dz;
  // a mine has a footprint: the cell and its neighbours must be free ground
  let ok=true;
  for(let j=-1;j<=1&&ok;j++)for(let i=-1;i<=1&&ok;i++){const ch=rows[cz+j]?.[cx+i];if(!ch||!FREE.test(ch)||taken.has((cx+i)+','+(cz+j)))ok=false;}
  if(!ok)continue;
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++)taken.add((cx+i)+','+(cz+j));
  return [cx*scale+0.5,cz*scale+0.5];
 }
 return null;
}
function anchors(view,place,count){
 const w=view.width,h=view.height,cx=w/2,cz=h/2;
 if(place==='bases'){const s=view.players.map(p=>p.start).filter(Boolean);return s.map(([x,z])=>{const d=Math.hypot(cx-x,cz-z)||1,step=Math.min(9,d/3);return [x+(cx-x)/d*step,z+(cz-z)/d*step];});}
 if(place==='corners')return [[w*0.15,h*0.15],[w*0.85,h*0.15],[w*0.85,h*0.85],[w*0.15,h*0.85]];
 if(place==='edges')return [[cx,h*0.1],[w*0.9,cz],[cx,h*0.9],[w*0.1,cz]];
 // centre: evenly around the middle, so every side is as close
 const r=Math.max(3,Math.min(w,h)/10),out=[];
 for(let i=0;i<count;i++){const a=Math.PI*2*i/count+(count===2?0:Math.PI/2);out.push([cx+Math.cos(a)*r,cz+Math.sin(a)*r]);}
 return out;
}
function rectAround(view,place){
 const w=view.width,h=view.height;
 if(place==='centre')return [[Math.round(w/3),Math.round(h/3),Math.round(w*2/3),Math.round(h*2/3)]];
 if(place==='bases')return view.players.filter(p=>p.start).map(({start:[x,z]})=>[Math.max(0,Math.round(x-8)),Math.max(0,Math.round(z-8)),Math.min(w-1,Math.round(x+8)),Math.min(h-1,Math.round(z+8))]);
 if(place==='corners'){const a=Math.round(w/5),b=Math.round(h/5);return [[0,0,a,b],[w-1-a,0,w-1,b],[0,h-1-b,a,h-1],[w-1-a,h-1-b,w-1,h-1]];}
 const a=Math.round(w/8),b=Math.round(h/8);return [[0,0,w-1,b],[0,h-1-b,w-1,h-1],[0,0,a,h-1],[w-1-a,0,w-1,h-1]];
}
// An edit request → {calls} (applied on the open draft, undoable with rtsmcp undo) or {recipe} (rebuild).
function planEdit(draft,view,edit){
 const axis=riverAxis(draft);
 switch(edit.op){
  case 'river-add':{
   if(draft.river)return {error:'Река посередине уже есть. Скажите «сделай реку шире», если нужна шире.'};
   const river={width:Math.max(2,Math.round(view.width/18)),fords:3};
   return {calls:riverCalls([view.width,view.height],river,axis),river};
  }
  case 'river-wider':{
   if(!draft.river)return {error:'В черновике нет реки, которую нарисовал я. Скажите «добавь реку посередине».'};
   const river={...draft.river,width:Math.min(Math.round(view.width/3),draft.river.width+2)};
   if(river.width===draft.river.width)return {error:'Река уже занимает треть карты — шире не сделаю.'};
   return {calls:riverCalls([view.width,view.height],river,axis),river};
  }
  case 'river-narrower':{
   if(!draft.river)return {error:'В черновике нет реки, которую нарисовал я.'};
   if(draft.river.width<=2)return {error:'Река и так узкая (2 клетки).'};
   return {recipe:{river:{...draft.river,width:draft.river.width-2}}};
  }
  case 'fords-more':{
   if(!draft.river)return {error:'Броды бывают только у реки посередине — её в черновике нет.'};
   const river={...draft.river,fords:Math.min(7,draft.river.fords+2)};
   return {calls:riverCalls([view.width,view.height],river,axis).filter(c=>c[1].kind==='shallow'),river};
  }
  case 'resources-add':{
   const type=draft.kinds?.resources?.[0];
   if(!type)return {error:'Не понял, какой тип объектов в этой игре — месторождение.'};
   const taken=new Set(),calls=[];
   const spots=edit.place==='bases'?anchors(view,'bases',0):anchors(view,edit.place,edit.count);
   const want=edit.place==='bases'?spots.length:edit.count;
   for(let i=0;i<want;i++){const a=spots[i%spots.length];const p=freeNear(view,a[0],a[1],taken);if(p)calls.push(['entity_place',{type,owner:0,x:p[0],z:p[1]}]);}
   if(!calls.length)return {error:'Не нашёл свободной земли для месторождений в этом месте.'};
   return {calls};
  }
  case 'trees-remove':case 'resources-remove':{
   const types=edit.op==='trees-remove'?draft.kinds?.trees||[]:draft.kinds?.resources||[];
   if(!types.length)return {error:edit.op==='trees-remove'?'На карте нет леса.':'На карте нет месторождений.'};
   const calls=[];
   for(const rect of rectAround(view,edit.place))for(const type of types)calls.push(['entity_delete',{all:true,owner:0,type,rect}]);
   return {calls};
  }
  case 'params':{
   const params={...draft.gen.params,...(edit.params||{})};
   if(edit.grow&&view.width&&view.height)params.size=[view.width,view.height].map(n=>Math.max(16,Math.min(1024,Math.round(n*edit.grow))));
   return {recipe:{gen:{...draft.gen,params}}};
  }
  default:return {error:'Такую правку я пока не умею.'};
 }
}

// ---- save, balance ---------------------------------------------------------------------------------------------
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
// A new file name in maps/ that no map uses yet.
function proposeFile(folder,draft){
 const base='gen_'+(slug(draft.gen.preset)||'map')+'_'+draft.gen.players+'p'+(draft.teams?'_'+draft.teams.join('v'):'')+'_s'+draft.gen.seed;
 for(let i=0;i<100;i++){const rel='maps/'+base+(i?'_'+(i+1):'')+'.json';if(!fs.existsSync(path.join(folder,rel)))return rel;}
 return 'maps/'+base+'_'+Date.now()+'.json';
}
function checkFile(rel){
 const clean=String(rel||'').replace(/\\/g,'/');
 if(!/^maps\/[A-Za-z0-9_.-]{1,80}\.json$/.test(clean)||clean.includes('..'))throw Error('Имя файла карты: maps/<имя>.json, латиница, цифры, «_», «-».');
 return clean;
}
async function save(mcp,draft,{file,overwrite=false}){
 const rel=checkFile(file);
 const exists=fs.existsSync(path.join(draft.folder,rel));
 if(exists&&!overwrite)return {exists:true,file:rel};
 await mcp.call('map_set',{path:'name',value:draft.title});
 await mcp.call('map_save',{file:rel,addToGame:true,title:draft.title});
 return {saved:true,file:rel,overwritten:exists};
}
async function balance(mcp,{runs=4,seconds=900}={},options){
 const r=await mcp.call('balance_batch',{runs,seconds},options);
 return {
  runs:r?.runs||runs,
  players:(r?.players||[]).map(p=>({n:p.player,name:String(p.name||'').slice(0,40),wins:p.wins||0,winRate:Number(p.winRate)||0})),
  seconds:r?.seconds||null,timeouts:r?.timeouts||0,draws:r?.draws||0,
  games:(r?.games||[]).slice(0,16).map(g=>({seed:g.seed,winner:String(g.winner||'').slice(0,40),seconds:g.seconds})),
  at:new Date().toISOString()
 };
}
module.exports={build,describe,planEdit,riverCalls,teamsOf,parseAscii,kinds,issuesOf,proposeFile,checkFile,save,balance,run,open,NOISE};
