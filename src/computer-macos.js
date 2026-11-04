/* Executed by osascript. All supplied strings are data, never evaluated. */
function run(argv){
 const a=JSON.parse(argv[0]),se=Application('System Events');
 if(a.type==='apps')return JSON.stringify(se.applicationProcesses().filter(p=>!p.backgroundOnly()).map(p=>({pid:p.unixId(),name:p.name(),identity:p.bundleIdentifier()||''})));
 let controlledProcess;
 if(a.mode==='app'||a.type==='focus'||a.type==='search'){
 const p=se.applicationProcesses.whose({unixId:a.pid})();if(!p.length||p[0].bundleIdentifier()!==a.identity)throw Error('Приложение изменилось. Повторите выбор.');
 controlledProcess=p[0];p[0].frontmost=true;delay(.2);if(!p[0].frontmost())throw Error('Не удалось активировать приложение.');
 }
 function visual(event){if(a.visual)console.log('PETYA_CONTROL:'+JSON.stringify(event));}
 if(a.visual){
 try{
 ObjC.import('Cocoa');ObjC.import('ApplicationServices');
 const location=$.CGEventGetLocation($.CGEventCreate(null));const pointer=Number.isFinite(a.x)?{x:a.x,y:a.y}:{x:location.x,y:location.y};
 const mouse=['click','drag','scroll'].includes(a.type);
 const pid=a.pid||(!mouse?se.applicationProcesses.whose({frontmost:true})()[0].unixId():null);
 const rows=ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(17,0)))||[];
 const row=rows.find(r=>{const b=r.kCGWindowBounds;return r.kCGWindowLayer===0&&b&&b.Width>0&&b.Height>0&&(pid?r.kCGWindowOwnerPID===pid:pointer.x>=b.X&&pointer.x<b.X+b.Width&&pointer.y>=b.Y&&pointer.y<b.Y+b.Height);});
 visual({pointer,...row?{window:{x:row.kCGWindowBounds.X,y:row.kCGWindowBounds.Y,width:row.kCGWindowBounds.Width,height:row.kCGWindowBounds.Height,name:row.kCGWindowOwnerName||''}}:{}});
 delay(.14);
 }catch{visual({});}
 }
 if(a.type==='search'){
 if(a.service!=='telegram'||!['ru.keepcoder.Telegram','org.telegram.desktop'].includes(a.identity))throw Error('Неизвестное приложение поиска.');
 const attr=(e,name)=>{try{return e.attributes.byName(name).value();}catch{return '';}};
 function snapshot(){const nodes=[];let count=0;
 function walk(e,depth,parent){if(depth>14||count++>=450)return;const node={e,parent,role:String(attr(e,'AXRole')),subrole:String(attr(e,'AXSubrole')),label:[attr(e,'AXTitle'),attr(e,'AXDescription'),attr(e,'AXPlaceholderValue'),attr(e,'AXRoleDescription')].filter(v=>typeof v==='string').join(' '),value:attr(e,'AXValue')};nodes.push(node);let children=[];try{children=e.uiElements();}catch{}for(const c of children)walk(c,depth+1,node);}
 for(const w of controlledProcess.windows())walk(w,0,null);return nodes;}
 const fields=snapshot().filter(n=>['AXTextField','AXSearchField','AXComboBox'].includes(n.role)&&(n.subrole==='AXSearchField'||/(?:search|поиск|найти)/i.test(n.label)));
 if(fields.length!==1)throw Error(fields.length?'В окне несколько полей поиска. Откройте основной список чатов Telegram и повторите.':'Telegram не предоставил доступное поле поиска. Откройте основной список чатов и проверьте универсальный доступ Пети.');
 const field=fields[0].e;field.attributes.byName('AXFocused').value=true;
 if(!controlledProcess.frontmost()||attr(field,'AXFocused')!==true)throw Error('Не удалось установить фокус в поле поиска.');
 if(a.visual){try{const p=field.position(),size=field.size();visual({pointer:{x:p[0]+Math.min(20,size[0]/2),y:p[1]+size[1]/2}});}catch{}}
 se.keystroke('a',{using:['command down']});se.keystroke(a.query);
 if(String(attr(field,'AXValue'))!==a.query)throw Error('Telegram не подтвердил введённый поисковый запрос.');
 let result={results:[],empty:false},last='';
 for(let round=0;round<4;round++){
 delay(.5);if(a.visual){try{const w=controlledProcess.windows()[0],p=w.position(),size=w.size();visual({window:{x:p[0],y:p[1],width:size[0],height:size[1],name:controlledProcess.name()}});}catch{}}if(!controlledProcess.frontmost())throw Error('Активное приложение изменилось во время поиска.');
 const full=snapshot();const under=(n,root)=>{for(let p=n;p;p=p.parent)if(p===root)return true;return false;};
 const input=full.find(n=>n.role===fields[0].role&&String(n.value)===a.query);let resultRoot=null;
 for(let parent=input?.parent;parent;parent=parent.parent){
 const lists=full.filter(n=>under(n,parent)&&['AXList','AXTable','AXOutline','AXScrollArea'].includes(n.role));
 const outer=lists.filter(n=>!lists.some(other=>other!==n&&under(n,other)));
 if(outer.length===1){resultRoot=outer[0];break;}if(outer.length>1)break;
 }
 if(!resultRoot){result={results:[],empty:false,message:'Не удалось отличить список результатов от других областей окна Telegram.'};break;}
 const nodes=full.filter(n=>under(n,resultRoot)),texts=n=>nodes.filter(c=>{for(let p=c;p;p=p.parent)if(p===n)return true;return false;}).filter(c=>['AXStaticText','AXCell','AXButton'].includes(c.role)).map(c=>typeof c.value==='string'&&c.value?c.value:c.label).filter(Boolean);
 const rows=nodes.filter(n=>['AXRow','AXCell'].includes(n.role)||n.role==='AXButton'&&(()=>{for(let p=n.parent;p;p=p.parent)if(['AXList','AXTable','AXOutline','AXScrollArea'].includes(p.role))return true;return false;})());
 const seen=new Set();result.results=[];
 for(const n of rows){const text=[...new Set(texts(n))].join(' · ').trim().slice(0,500);if(text&&!seen.has(text)){seen.add(text);result.results.push({text});}if(result.results.length>=40)break;}
 result.empty=nodes.some(n=>n.role==='AXStaticText'&&/^(?:no results(?: found)?|nothing found|no contacts found|ничего не найдено|нет результатов|контакты не найдены)[.!]?$/i.test(String(n.value||n.label).trim()));
 const signature=JSON.stringify(result);if(round>=2&&signature===last)break;last=signature;
 }
 if(!result.results.length&&!result.empty)result.message='Telegram не раскрыл строки результатов через универсальный доступ.';
 return JSON.stringify(result);
 }
 const codes={enter:36,tab:48,escape:53,backspace:51,delete:117,home:115,end:119,pageup:116,pagedown:121,space:49,up:126,down:125,left:123,right:124,f1:122,f2:120,f3:99,f4:118,f5:96,f6:97,f7:98,f8:100,f9:101,f10:109,f11:103,f12:111};
 if(a.type==='text')se.keystroke(a.text);
 if(a.type==='key'){
 const shortcuts={copy:'c',paste:'v',cut:'x',undo:'z',redo:'z',selectAll:'a',save:'s'};
 if(shortcuts[a.key])se.keystroke(shortcuts[a.key],{using:a.key==='redo'?['command down','shift down']:['command down']});else if(codes[a.key]!==undefined)se.keyCode(codes[a.key]);else throw Error('Неизвестная клавиша');
 }
 if(a.type==='hotkey'){
 const mods={meta:'command down',ctrl:'control down',alt:'option down',shift:'shift down'},using=a.modifiers.map(m=>mods[m]);
 if(codes[a.key]!==undefined)se.keyCode(codes[a.key],{using});else se.keystroke(a.key,{using});
 }
 if(a.type==='click'&&!a.button&&!a.count){if(a.mode!=='desktop')throw Error('Нет доступа к рабочему столу');se.click({at:[a.x,a.y]});}
 if(['scroll','drag','release'].includes(a.type)||(a.type==='click'&&(a.button||a.count))){
 ObjC.import('Cocoa');ObjC.import('ApplicationServices');
 const post=(type,x,y,button,count)=>{const e=$.CGEventCreateMouseEvent(null,type,$.CGPointMake(x,y),button);if(count)$.CGEventSetIntegerValueField(e,1,count);$.CGEventPost(0,e);};
 if(a.type==='scroll'){
 const vertical=a.direction==='up'||a.direction==='down',delta=(a.direction==='down'||a.direction==='right'?-1:1)*a.amount;
 const e=$.CGEventCreateScrollWheelEvent2(null,1,2,vertical?delta:0,vertical?0:delta,0);$.CGEventPost(0,e);
 }
 if(a.type==='click'){
 if(a.mode!=='desktop')throw Error('Нет доступа к рабочему столу');const right=a.button==='right';
 for(let n=1;n<=(a.count||1);n++){post(right?3:1,a.x,a.y,right?1:0,n);post(right?4:2,a.x,a.y,right?1:0,n);if(n<a.count)delay(.06);}
 }
 if(a.type==='drag'){
 if(a.mode!=='desktop')throw Error('Нет доступа к рабочему столу');
 post(1,a.x,a.y,0,1);try{for(let n=1;n<=12;n++){visual({pointer:{x:a.x+(a.toX-a.x)*n/12,y:a.y+(a.toY-a.y)*n/12}});post(6,a.x+(a.toX-a.x)*n/12,a.y+(a.toY-a.y)*n/12,0);delay(.02);}}finally{post(2,a.toX,a.toY,0,1);}
 }
 if(a.type==='release'){const p=$.CGEventGetLocation($.CGEventCreate(null));post(2,p.x,p.y,0);}
 }
 return JSON.stringify({ok:true});
}
