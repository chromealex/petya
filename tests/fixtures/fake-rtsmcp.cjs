// A stand-in for the RTS engine's rtsmcp in unit tests: MCP over stdio (one JSON-RPC message per line) with the
// tools «Генератор уровней» uses, answering in rtsmcp's shapes (JSON text content, isError on {"error"}). The map
// is a small grid of characters with objects; edits are undoable; map_save writes the file like the real server.
// FAKE_RTSMCP_LOG=<file> appends every call; `slow` sleeps; `crash` exits.
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2);
const log=process.env.FAKE_RTSMCP_LOG;
const TOOLS=['list_projects','list_games','open_game','create_project','map_list','map_open','map_new','map_save','map_info','map_ascii','map_get','map_set','map_generate','map_validate','gen_presets','entity_list','entity_place','entity_delete','terrain_level','terrain_paint','undo','balance_batch','match_run','slow','crash'].map(name=>({name,description:name,inputSchema:{type:'object',properties:{}}}));
let game='',map=null,history=[];
const clone=v=>JSON.parse(JSON.stringify(v));
function blank(w,h,name){return {name,file:'',w,h,rows:Array.from({length:h},()=>'.'.repeat(w)),players:[{name:'Blue',team:1},{name:'Red',team:2}],entities:[],generated:null,extra:{}};}
function paint(rect,ch){const [x0,y0,x1,y1]=rect;for(let y=Math.max(0,y0);y<=Math.min(map.h-1,y1);y++){const r=map.rows[y].split('');for(let x=Math.max(0,x0);x<=Math.min(map.w-1,x1);x++)r[x]=ch;map.rows[y]=r.join('');}}
function save(){history.push(clone(map));if(history.length>50)history.shift();}
function generate(a){
 const [w,h]=a.params?.size||[48,48],n=a.players||2;
 if(a.symmetry==='mirror'&&n!==2)return {error:"generate: symmetry 'mirror' needs 2 players (got "+n+")"};
 save();
 const seed=a.seed||1;
 map={...map,w,h,rows:[],players:[],entities:[],dirty:true};
 for(let y=0;y<h;y++){let r='';for(let x=0;x<w;x++){const v=((x*7+y*13+seed*31)%97);r+=v<6?'~':v<12?'1':v<16?'n':'.';}map.rows.push(r);}
 const starts=n===4?[[6.5,6.5],[w-6.5,6.5],[w-6.5,h-6.5],[6.5,h-6.5]]:n===2?[[6.5,h/2],[w-6.5,h/2]]
  :Array.from({length:n},(_,i)=>[Math.round(w/2+Math.cos(Math.PI*2*i/n)*(w/2-6))+0.5,Math.round(h/2+Math.sin(Math.PI*2*i/n)*(h/2-6))+0.5]);
 starts.forEach((s,i)=>{map.players.push({name:['Blue','Red','Зелёные','Жёлтые'][i]||'P'+(i+1),team:i+1,start:s});map.entities.push({type:'townhall',owner:i+1,x:s[0],z:s[1]});});
 const mult=a.params?.resources||1;
 for(let i=0;i<Math.round(n*2*mult);i++)map.entities.push({type:'goldmine',owner:0,x:4+((i*11+seed)%(w-8))+0.5,z:4+((i*17+seed)%(h-8))+0.5});
 for(let i=0;i<40;i++)map.entities.push({type:'tree',owner:0,x:((i*5+seed)%w)+0.5,z:((i*9)%h)+0.5});
 const objects={};for(const e of map.entities.filter(e=>e.owner===0))objects[e.type]=(objects[e.type]||0)+1;
 const paths=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)paths.push([i+1,j+1,Math.hypot(starts[i][0]-starts[j][0],starts[i][1]-starts[j][1])*1.2]);
 map.generated={preset:a.preset,seed,players:n,symmetry:a.symmetry,starts,paths,connected:true,pathSpread:0,objects};
 return {ok:true,generated:map.generated,size:[w,h],entities:map.entities.length,summary:'Сгенерировано'};
}
function inRect(e,r){return e.x>=r[0]&&e.x<=r[2]+1&&e.z>=r[1]&&e.z<=r[3]+1;}
function call(name,a={}){
 if(name==='slow')return new Promise(r=>setTimeout(()=>r({ok:true}),Number(a.ms)||5000));
 if(name==='crash')process.exit(3);
 if(name==='list_projects'||name==='list_games')return {projects:(process.env.FAKE_RTSMCP_PROJECTS||'').split(path.delimiter).filter(Boolean).map(dir=>({name:path.basename(dir),dir})),templates:[{id:'skirmish',name:'Iron and Gold'},{id:'empty',name:'Пустой проект'}]};
 if(name==='open_game'){if(!fs.existsSync(path.join(a.game||'','game.json')))return {error:'no game.json in '+a.game};game=a.game;map=blank(64,48,'Valley');map.file='maps/valley.json';history=[];return {ok:true,dir:game};}
 if(!game)return {error:'no game open'};
 if(name==='map_list'){const files=fs.existsSync(path.join(game,'maps'))?fs.readdirSync(path.join(game,'maps')).map(f=>'maps/'+f):[];return {files,inGame:files.slice(0,1).map(file=>({file,title:'Valley'})),open:map?.file||''};}
 if(name==='map_open'){map=blank(64,48,'Valley');map.file=a.file;history=[];return {ok:true};}
 if(name==='map_new'){map=blank(a.width,a.height,a.name||'New');history=[];return {ok:true};}
 if(name==='gen_presets')return {presets:[
  {id:'classic',title:'Классика (Warcraft / Red Alert)',genre:'classic land RTS',source:'engine',params:{shape:'classic',size:[64,64],water:0.1,rivers:0.4,levels:1,trees:1}},
  {id:'islands',title:'Архипелаг',genre:'naval / any',source:'engine',params:{shape:'islands',size:[96,96],water:0.62,islands:4}},
  {id:'rocky',title:'Каменная планета',genre:'planet',source:'engine',params:{shape:'planet',faceSize:32}}],
  params:'shape, size [w,h], water 0..1, rivers 0..1, levels 0..9, plateau, trees, resources (multipliers), islands, baseRadius'};
 if(!map)return {error:'no map open'};
 if(name==='map_generate')return generate(a);
 if(name==='map_info')return {name:map.name,file:map.file,width:map.w,height:map.h,dirty:!!map.dirty,players:map.players,entities:map.entities.length};
 if(name==='map_ascii'){
  const rows=map.rows.map(r=>r.split(''));
  for(const e of map.entities){const x=Math.floor(e.x),z=Math.floor(e.z);if(rows[z]?.[x]!==undefined)rows[z][x]=e.owner>0?String.fromCharCode(64+e.owner):'n';}
  return {text:'legend: . ground ~ water; scale 1:1\n'+rows.map(r=>r.join('')).join('\n')+'\n'};
 }
 if(name==='map_set'){save();const m=/^players\[(\d+)\]\.team$/.exec(a.path);if(m)map.players[Number(m[1])].team=a.value;else if(a.path==='name')map.name=a.value;else map.extra[a.path]=a.value;return {ok:true};}
 if(name==='map_validate'){
  const issues=[];if(map.generated)issues.push({error:false,text:"map.generated: unknown key, did you mean 'generate'?"});
  for(const e of map.entities)if(e.owner===0&&map.rows[Math.floor(e.z)]?.[Math.floor(e.x)]==='~')issues.push({error:true,text:e.type+': стоит на непроходимой клетке'});
  return {issues,ok:!issues.some(i=>i.error)};
 }
 if(name==='entity_list')return {entities:map.entities.map((e,index)=>({index,...e})).filter(e=>(a.type===undefined||e.type===a.type)&&(a.owner===undefined||e.owner===a.owner))};
 if(name==='entity_place'){save();map.entities.push({type:a.type,owner:a.owner||0,x:a.x,z:a.z});return {ok:true};}
 if(name==='entity_delete'){save();const before=map.entities.length;map.entities=map.entities.filter(e=>!((a.owner===undefined||e.owner===a.owner)&&(a.type===undefined||e.type===a.type)&&(!a.rect||inRect(e,a.rect))));return {ok:true,removed:before-map.entities.length};}
 if(name==='terrain_level'){save();paint(a.rect,a.level?String(a.level):'.');return {ok:true};}
 if(name==='terrain_paint'){save();paint(a.rect,{water:'~',shallow:'=',ground:'.',blocked:'#'}[a.kind]||'.');return {ok:true};}
 if(name==='undo'){if(!history.length)return {error:'nothing to undo'};map=history.pop();return {ok:true,summary:'Отменено'};}
 if(name==='map_save'){
  const file=a.file||map.file;const full=path.join(game,file);fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,JSON.stringify({name:map.name,size:[map.w,map.h],players:map.players,entities:map.entities,terrain:{rows:map.rows}}));
  if(a.addToGame){const g=JSON.parse(fs.readFileSync(path.join(game,'game.json'),'utf8'));g.maps=(g.maps||[]).filter(m=>m.file!==file);g.maps.push({file,title:a.title||map.name});fs.writeFileSync(path.join(game,'game.json'),JSON.stringify(g));}
  map.file=file;map.dirty=false;return {ok:true,summary:'Сохранена карта '+file};
 }
 if(name==='balance_batch'){const n=map.players.length;return {runs:a.runs||8,players:map.players.map((p,i)=>({player:i+1,name:p.name,wins:i===0?3:1,winRate:i===0?0.75:0.25/(n-1)})),seconds:{avg:412,min:380,median:410,max:455},timeouts:0,draws:0,games:[{seed:1,winner:'Blue',seconds:410}]};}
 return {error:'unknown tool '+name};
}
let buf='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',async chunk=>{
 buf+=chunk;let i;
 while((i=buf.indexOf('\n'))>=0){
  const line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;
  const msg=JSON.parse(line);
  if(log)fs.appendFileSync(log,JSON.stringify({method:msg.method,name:msg.params?.name,args:msg.params?.arguments,argv:args})+'\n');
  if(msg.id===undefined)continue;
  const out=r=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,...r})+'\n');
  if(msg.method==='initialize')out({result:{protocolVersion:msg.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'rtsengine',version:'0.2.0'}}});
  else if(msg.method==='tools/list')out({result:{tools:TOOLS}});
  else if(msg.method==='tools/call'){
   Promise.resolve(call(msg.params.name,msg.params.arguments||{})).then(r=>{
    const text=r&&r.text&&Object.keys(r).length===1?r.text:JSON.stringify(r);
    out({result:{content:[{type:'text',text}],...(r&&r.error?{isError:true}:{})}});
   });
  }else out({error:{code:-32601,message:'method not found: '+msg.method}});
 }
});
process.stdin.on('end',()=>process.exit(0));
