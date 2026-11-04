const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../src/computer-macos.js'),'utf8');
function test({ambiguous=false,search=true}={}){
 let value='',focused=false,front=false;const typed=[];
 function node(role,props={},children=[]){return {attributes:{byName(name){const record={};Object.defineProperty(record,'value',{get:()=>()=>name==='AXRole'?role:name==='AXFocused'?focused:name==='AXValue'&&role==='AXTextField'?value:props[name]||'',set:v=>{if(name==='AXFocused')focused=v;else throw Error('Unexpected attribute write');}});return record;}},uiElements:()=>children};}
 const field=node('AXTextField',{AXPlaceholderValue:search?'Search':'Message'}),row=node('AXRow',{},[node('AXStaticText',{AXValue:'Вася Иванов'})]);
 const sidebar=node('AXGroup',{},[field,...ambiguous?[node('AXTextField',{AXPlaceholderValue:'Search'})]:[],node('AXTable',{},[row])]);
 const window=node('AXWindow',{},[sidebar,node('AXTable',{},[node('AXRow',{},[node('AXStaticText',{AXValue:'Вася в старой переписке'})])])]);
 const proc={bundleIdentifier:()=> 'ru.keepcoder.Telegram',windows:()=>[window]};Object.defineProperty(proc,'frontmost',{get:()=>()=>front,set:v=>front=v});
 const se={applicationProcesses:{whose:()=>()=>[proc]},keystroke:(text,options)=>{assert(front&&focused);typed.push(text);if(!options)value=text;}};
 const context={Application:()=>se,delay:()=>{}};vm.createContext(context);vm.runInContext(source,context);
 const execute=()=>JSON.parse(context.run([JSON.stringify({type:'search',service:'telegram',pid:42,identity:'ru.keepcoder.Telegram',mode:'desktop',query:'Вася'})]));
 if(ambiguous||!search){assert.throws(execute,/полей поиска|поле поиска/);assert.deepEqual(typed,[]);}else{const result=execute();assert.equal(result.results[0].text,'Вася Иванов');assert.deepEqual(typed,['a','Вася']);assert.equal(result.empty,false);assert(!JSON.stringify(result).includes('старой переписке'));}
}
test();test({ambiguous:true});test({search:false});
console.log('Native search UI: field discovery, focus verification, input, observed rows and ambiguous-field rejection passed');
