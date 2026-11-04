const {execFile}=require('node:child_process');
const path=require('node:path');
const keys=['enter','tab','escape','backspace','delete','home','end','pageup','pagedown','space','up','down','left','right','copy','paste','cut','undo','redo','selectAll','save'];
const aliases={'ввод':'enter','таб':'tab','эскейп':'escape','пробел':'space','вверх':'up','вниз':'down','влево':'left','вправо':'right','копировать':'copy','вставить':'paste','вырезать':'cut','отменить':'undo','повторить':'redo','выделить всё':'selectAll','сохранить':'save','selectall':'selectAll'};
const modifiers={ctrl:'ctrl',control:'ctrl','контрол':'ctrl',cmd:'meta',command:'meta',meta:'meta','команд':'meta',alt:'alt',option:'alt','альт':'alt',shift:'shift','шифт':'shift'};
function parseCommand(text){
 const s=String(text).replace(/^петя[,\s]+/iu,'').trim();
 if(/^останови управление[.!]*$/iu.test(s))return {type:'stop'};
 let m=s.match(/^введи текст[ :]+([\s\S]+)$/iu);if(m)return {type:'text',text:m[1]};
 m=s.match(/^переключись на приложение\s+(.+)$/iu);if(m)return {type:'focus',name:m[1].trim()};
 m=s.match(/^нажми (.+?)[.!]*$/iu);
 if(m){const raw=m[1].toLowerCase(),key=aliases[raw]||raw;if(keys.includes(key))return {type:'key',key};
 const parts=raw.split(/\s*\+\s*/);if(parts.length>1){const key=aliases[parts.at(-1)]||parts.at(-1);return {type:'hotkey',key,modifiers:parts.slice(0,-1).map(p=>modifiers[p]||p)};}}
 m=s.match(/^(?:(двойной|правый) )?клик (-?\d+)\s+(-?\d+)$/iu);if(m)return {type:'click',x:Number(m[2]),y:Number(m[3]),...(m[1]?{button:m[1].toLowerCase()==='правый'?'right':'left',count:m[1].toLowerCase()==='двойной'?2:1}:{})};
 m=s.match(/^прокрути (вверх|вниз|влево|вправо)(?:\s+(\d+))?$/iu);if(m)return {type:'scroll',direction:aliases[m[1].toLowerCase()],amount:Number(m[2]||3)};
 m=s.match(/^перетащи (-?\d+)\s+(-?\d+)\s+(?:в|на)\s+(-?\d+)\s+(-?\d+)$/iu);if(m)return {type:'drag',x:Number(m[1]),y:Number(m[2]),toX:Number(m[3]),toY:Number(m[4])};
 return null;
}
function validPoint(n){return Number.isInteger(n)&&Math.abs(n)<=30000;}
function durable(target){return target&&typeof target.identity==='string'&&target.identity.length>0?{identity:target.identity,name:String(target.name||'Приложение')}:null;}
class ComputerControl{
 constructor({platform=process.platform,run,access=()=>true,load=()=>null,save=()=>{},visual=null}={}){
 this.platform=platform;this.access=access;this.save=save;this.visual=visual;
 this.run=run||((payload,signal)=>new Promise((resolve,reject)=>{const mac=platform==='darwin';const root=__dirname.replace(/app\.asar(?=[/\\])/, 'app.asar.unpacked');const args=mac?['-l','JavaScript',path.join(root,'computer-macos.js'),JSON.stringify({...payload,visual:!!this.visual})]:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'computer-windows.ps1'),Buffer.from(JSON.stringify({...payload,visual:!!this.visual})).toString('base64')];const child=execFile(mac?'/usr/bin/osascript':'powershell.exe',args,{signal,timeout:payload.type==='search'?30000:12000,maxBuffer:1024*1024,windowsHide:true},(e,out)=>{if(e)return reject(Error('Управление не выполнено: '+e.message));try{resolve(JSON.parse(out.trim()||'{}'));}catch{reject(Error('Не удалось прочитать ответ ОС.'));}});let progress='';child.stderr?.on('data',chunk=>{progress+=chunk.toString();const lines=progress.split(/\r?\n/);progress=lines.pop().slice(-16384);for(const line of lines){if(!line.startsWith('PETYA_CONTROL:')||!this.busy||!this.abort||this.abort.signal.aborted)continue;try{this.visual?.update(JSON.parse(line.slice(14)));}catch{this.visual?.clear();}}});}));
 this.session=null;this.busy=false;this.generation=0;this.restoreError='';
 try{const saved=load();if(saved?.version===1&&saved.platform===platform){if(saved.mode==='desktop')this.session={mode:'desktop',target:null};else if(saved.mode==='app'&&durable(saved.target))this.session={mode:'app',target:durable(saved.target)};}}catch{this.restoreError='Не удалось прочитать сохранённый доступ. Включите управление заново.';}
 }
 status(){return {mode:this.session?.mode||'off',target:this.session?.target||null,persistent:!!this.session,busy:this.busy,restoreError:this.restoreError,accessGranted:this.platform==='darwin'?Boolean(this.access()):this.platform==='win32',supported:['darwin','win32'].includes(this.platform)};}
 async apps(){if(!this.status().supported)throw Error('Поддерживаются macOS и Windows.');const rows=await this.run({type:'apps'});return rows.filter((r,i)=>rows.findIndex(v=>v.pid===r.pid)===i);}
 persist(session){this.save({version:1,platform:this.platform,mode:session?.mode||'off',target:session?.target?durable(session.target):null});this.restoreError='';}
 async start({mode,pid,remember=true}={}){
 this.stop();const generation=this.generation;
 if(!['app','desktop'].includes(mode))throw Error('Выберите режим управления.');if(!this.status().supported)throw Error('Поддерживаются macOS и Windows.');if(!this.access())throw Error('Разрешите Пете универсальный доступ в настройках macOS.');
 let target=null;
 if(mode==='app'){const rows=await this.apps();if(generation!==this.generation)throw Error('Включение отменено.');target=rows.find(r=>r.pid===Number(pid));if(!target)throw Error('Выберите запущенное приложение.');if(!durable(target))throw Error('Не удалось определить постоянный идентификатор приложения.');}
 const next={mode,target:durable(target)};if(remember)this.persist(next);this.session=next;return this.status();
 }
 suspend(){this.generation++;this.abort?.abort();this.visual?.clear();}
 stop(){this.suspend();this.session=null;this.persist(null);return this.status();}
 async execute(action){
 if(action?.type==='stop')return this.stop();
 const session=this.session;if(!session)throw Object.assign(Error('Для запроса нужно разрешение на управление компьютером.'),{code:'COMPUTER_PERMISSION_REQUIRED',action:structuredClone(action)});
 if(!this.access())throw Object.assign(Error('Нужно разрешение macOS на управление компьютером.'),{code:'COMPUTER_PERMISSION_REQUIRED',action:structuredClone(action)});
 if(this.busy)throw Error('Дождитесь завершения предыдущего действия.');
 if(!action||!['text','key','click','hotkey','scroll','drag','focus','search'].includes(action.type))throw Error('Неизвестное действие.');
 if(action.type==='search'&&(action.service!=='telegram'||typeof action.query!=='string'||!action.query.trim()||action.query.length>120||/[\r\n]/.test(action.query)))throw Error('Укажите имя для поиска в Telegram.');
 if(action.type==='text'&&(typeof action.text!=='string'||!action.text.length||action.text.length>4000))throw Error('Введите от 1 до 4000 символов.');
 if(action.type==='key'&&!keys.includes(action.key))throw Error('Эта клавиша не поддерживается.');
 if(action.type==='hotkey'&&(!Array.isArray(action.modifiers)||!action.modifiers.length||action.modifiers.length>4||new Set(action.modifiers).size!==action.modifiers.length||action.modifiers.some(m=>!['ctrl','meta','alt','shift'].includes(m))||!/^([a-z0-9]|f(?:[1-9]|1[0-2])|enter|tab|escape|backspace|delete|home|end|pageup|pagedown|space|up|down|left|right)$/.test(action.key)))throw Error('Некорректное сочетание клавиш. Пример: Ctrl+Shift+S.');
 if(['click','drag','focus','scroll'].includes(action.type)&&session.mode!=='desktop')throw Error('Это действие доступно только в режиме всего компьютера.');
 if(['click','drag'].includes(action.type)&&(!validPoint(action.x)||!validPoint(action.y)))throw Error('Некорректные координаты.');
 if(action.type==='click'&&((action.button!==undefined&&!['left','right'].includes(action.button))||(action.count!==undefined&&![1,2].includes(action.count))))throw Error('Некорректный клик.');
 if(action.type==='drag'&&(!validPoint(action.toX)||!validPoint(action.toY)))throw Error('Некорректные координаты.');
 if(action.type==='scroll'&&(!['up','down','left','right'].includes(action.direction)||!Number.isInteger(action.amount)||action.amount<1||action.amount>100))throw Error('Прокрутка: направление и от 1 до 100 шагов.');
 if(action.type==='focus'&&(typeof action.name!=='string'||!action.name.trim()||action.name.length>300))throw Error('Укажите точное название приложения.');
 // App mode must not let a global shortcut move focus into another application.
 if(session.mode==='app'&&action.type==='hotkey'&&(!/^[acvxyzsfnpow]$/.test(action.key)||!action.modifiers.includes(this.platform==='darwin'?'meta':'ctrl')||action.modifiers.some(m=>![this.platform==='darwin'?'meta':'ctrl','shift'].includes(m))))throw Error('Это сочетание может переключить приложение. Используйте режим всего компьютера.');
 this.busy=true;let completed=false;const generation=this.generation;this.abort=new AbortController();
 try{
 let target;
 if(session.mode==='app'||action.type==='focus'||action.type==='search'){
 const rows=await this.apps();if(generation!==this.generation)throw Error('Управление остановлено.');
 const isTelegram=r=>this.platform==='darwin'?['ru.keepcoder.Telegram','org.telegram.desktop'].includes(r.identity):/[/\\]Telegram\.exe$/i.test(r.identity||'');
 if(action.type==='search'&&session.mode==='app'&&!isTelegram(session.target))throw Error('Доступ ограничен другим приложением. Разрешите управление Telegram или всем компьютером.');
 const matches=rows.filter(r=>action.type==='search'?(isTelegram(r)&&(session.mode!=='app'||r.identity===session.target.identity)):session.mode==='app'?r.identity===session.target.identity:r.name.toLocaleLowerCase()===action.name.trim().toLocaleLowerCase());
 if(matches.length!==1)throw Error(matches.length?'Открыто несколько экземпляров. Выберите приложение вручную.':'Приложение не запущено. Откройте его и повторите команду.');target=matches[0];
 }
 if(generation!==this.generation)throw Error('Управление остановлено.');
 if(this.visual)await this.visual.begin(action);if(generation!==this.generation)throw Error('Управление остановлено.');
 const observation=await this.run({...action,...target?{pid:target.pid,identity:target.identity}:{},mode:session.mode},this.abort.signal);
 completed=true;return {observation,text:'Выполнено: '+({text:'ввод текста',key:action.key,hotkey:'сочетание клавиш',click:'клик',scroll:'прокрутка',drag:'перетаскивание',focus:'переключение приложения',search:'поиск в Telegram'}[action.type])};
 }finally{
 if((action.type==='drag'||action.type==='hotkey'&&action.modifiers.includes('meta'))&&!completed){try{await this.run({type:'release',mode:'desktop'});}catch{}}
 this.visual?.finish(completed&&generation===this.generation);this.busy=false;this.abort=null;
 }
 }
 async command(text){const action=parseCommand(text);if(!action)return null;const result=await this.execute(action);return {handled:true,text:result.text||'Управление остановлено. Доступ после перезапуска также выключен.'};}
}
module.exports={ComputerControl,parseCommand};
