// «Конвертер» cards in the real chat: thumbnails, editable chips, estimate bars, «Скачать ffmpeg» when missing,
// per-file progress with «Отменить», results with before → after bars and «Показать в Finder»; file names stay text.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 // The card's main-process calls go to the real feature; its state is filled here: thumbnails drawn on a canvas,
 // plans with their files, a running job that advances on every status call.
 const conv=require('../src/extensions/converter/feature.cjs');
 const thumbs=await js(`[...Array(9).keys()].map(i=>{const c=document.createElement('canvas');c.width=112;c.height=84;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,112,84);gr.addColorStop(0,'hsl('+i*47+',55%,55%)');gr.addColorStop(1,'hsl('+(i*47+60)+',50%,30%)');g.fillStyle=gr;g.fillRect(0,0,112,84);g.fillStyle='#fff8';g.beginPath();g.arc(80,26,12,0,7);g.fill();g.fillStyle='#0005';g.beginPath();g.moveTo(0,84);g.lineTo(40,40);g.lineTo(70,70);g.lineTo(90,55);g.lineTo(112,84);g.fill();return c.toDataURL('image/png');})`);
 const calls=[];conv.deps.thumbnail=async file=>{calls.push(['thumbnail',file]);return thumbs[calls.length%9];};
 const plan=(id,p)=>conv.state.plans.set(id,{plan:{outDir:'',...p},topicId:'',at:Date.now()});
 // Real files: the card's edits are re-estimated from their sizes and headers.
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-conv-ui-'));
 const names=['Главный экран','inventory','shop_banner','<img src=x onerror=alert(1)>','map','hero','store-1','store-2','store-3','store-4','store-5'];
 const files=names.map((n,i)=>{const f=path.join(dir,n+'.png');const b=Buffer.alloc((3+i)*1048576);b.writeUInt32BE(0x89504e47,0);b.writeUInt32BE(2560,16);b.writeUInt32BE(1600,20);fs.writeFileSync(f,b);return f;});
 plan('plan-img',{kind:'image',from:'png',to:'webp',params:{maxSide:1024},files});
 plan('plan-vid',{kind:'video',to:'gif',params:{fps:15,trim:{start:5,end:12}},files:['/Users/me/Movies/bug-repro.mov']});
 plan('plan-run',{kind:'video',from:'mov',to:'mp4',params:{targetBytes:10485760},files:['/v/intro.mov','/v/demo.mov','/v/outro.mov']});
 const controller=new AbortController();let ticks=0;
 const runningJob={id:'job-run',planId:'plan-run',running:true,controller,files:[{name:'intro.mov',before:48e6,state:'done',percent:100,after:9.6e6},{name:'demo.mov',before:120e6,state:'running',percent:42},{name:'outro.mov',before:20e6,state:'waiting',percent:0}]};
 conv.state.jobs.set('job-run',new Proxy(runningJob,{get(t,k){if(k==='files'){ticks++;t.files[1].percent=Math.min(90,42+ticks);}return t[k];}}));
 const images={id:'plan-img',kind:'image',from:'png',to:'webp',label:'PNG → WEBP',params:{maxSide:1024},outDir:'',platform:'darwin',count:11,before:48.2*1048576,estimate:6.1*1048576,needs:null,
  files:['Главный экран.png','inventory.png','shop_banner.png','<img src=x onerror=alert(1)>.png','map.png','hero.png','store-1.png','store-2.png','store-3.png'].map((name,i)=>({name,dir:'/Users/me/Screens',kind:'image',bytes:(3+i)*1048576,width:2560,height:1600}))};
 const video={id:'plan-vid',kind:'video',from:null,to:'gif',label:'Видео → GIF',params:{fps:15,trim:{start:5,end:12}},outDir:'',platform:'darwin',count:1,before:86*1048576,estimate:null,needs:'ffmpeg',
  files:[{name:'bug-repro.mov',dir:'/Users/me/Movies',kind:'video',bytes:86*1048576}]};
 const running={id:'plan-run',kind:'video',from:'mov',to:'mp4',label:'MOV → MP4',params:{targetBytes:10*1048576},outDir:'',platform:'darwin',count:3,before:188e6,estimate:31457280,needs:null,
  files:[{name:'intro.mov',dir:'/v',kind:'video',bytes:48e6},{name:'demo.mov',dir:'/v',kind:'video',bytes:120e6},{name:'outro.mov',dir:'/v',kind:'video',bytes:20e6}],
  result:{id:'job-run',running:true,files:[{name:'intro.mov',before:48e6,state:'done',percent:100,after:9.6e6},{name:'demo.mov',before:120e6,state:'running',percent:42},{name:'outro.mov',before:20e6,state:'waiting',percent:0}]}};
 const done={id:'plan-done',kind:'audio',from:'wav',to:'mp3',label:'WAV → MP3',params:{normalize:true},outDir:'',platform:'win32',count:3,before:96e6,estimate:12e6,needs:null,
  files:[{name:'voice-01.wav',dir:'C:\\\\rec',kind:'audio',bytes:42e6},{name:'voice-02.wav',dir:'C:\\\\rec',kind:'audio',bytes:38e6},{name:'broken.wav',dir:'C:\\\\rec',kind:'audio',bytes:16e6}],
  result:{id:'job-done',running:false,files:[{name:'voice-01.wav',before:42e6,after:4.1e6,state:'done',output:'voice-01-normalized.mp3'},{name:'voice-02.wav',before:38e6,after:3.6e6,state:'done',output:'voice-02-normalized.mp3'},{name:'broken.wav',before:16e6,after:0,state:'error',error:'ffmpeg завершился с кодом 1: Invalid data found when processing input'}]}};
 const msg=(text,card)=>({role:'assistant',text,by:'Конвертер',extensionData:{converterCard:card}});
 await js(`view('home');showDialogueMessages([{role:'user',text:'конвертни png в webp в папке ~/Screens до 1024'},${JSON.stringify(msg('PNG → WEBP (до 1024 px) · 11 файлов, 48,2 МБ → ≈ 6,1 МБ.',images))},{role:'user',text:'сделай гифку из видео'},${JSON.stringify(msg('Видео → GIF · нужен ffmpeg.',video))},${JSON.stringify(msg('Конвертирую.',running))},${JSON.stringify(msg('Готово.',done))}],'Конвертер')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.conv-card').length===4&&document.querySelectorAll('.conv-thumb img').length>=8"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.conv-card').length"),4);
 const card=sel=>`document.querySelector('.conv-card[data-plan-id="${sel}"]')`;
 assert.equal(await js(`${card('plan-img')}.querySelectorAll('.conv-file').length`),8,'eight tiles and a «more» tile');
 assert.equal(await js(`${card('plan-img')}.querySelector('.conv-more').textContent`),'+3');
 assert.equal(await js(`${card('plan-img')}.querySelectorAll('.conv-thumb img').length`),8,'image thumbnails from the main process');
 assert.equal(await js("document.querySelectorAll('.conv-card img[src=x]').length"),0,'file names are never HTML');
 assert.ok(await js(`[...${card('plan-img')}.querySelectorAll('.conv-name')].some(n=>n.textContent==='<img src=x onerror=alert(1)>.png')`));
 assert.deepEqual(await js(`[...${card('plan-img')}.querySelectorAll('.conv-chips .kit-chip')].map(c=>c.textContent)`),['Формат: WEBP ▾','Размер: до 1024 px ▾','Качество: авто ▾','Метаданные: оставить','Куда: рядом с исходниками ▾']);
 assert.equal(await js(`${card('plan-img')}.querySelectorAll('.conv-estimate .conv-bar-row').length`),2,'before and estimated after');
 assert.equal(await js(`${card('plan-img')}.querySelector('.kit-actions button.primary').textContent`),'Конвертировать');
 assert.deepEqual(await js(`[...${card('plan-vid')}.querySelectorAll('.kit-actions button')].map(b=>b.textContent)`),['Скачать ffmpeg','Конвертировать']);
 assert.match(await js(`${card('plan-vid')}.querySelector('.kit-card-head').textContent`),/нужен ffmpeg/);
 assert.equal(await js(`${card('plan-run')}.querySelectorAll('.conv-progress li').length`),3,'progress per file');
 assert.equal(await js(`${card('plan-run')}.querySelector('.kit-actions button').textContent`),'Отменить');
 assert.equal(await js(`${card('plan-done')}.querySelectorAll('.conv-results li.state-done .conv-compare').length`),2,'before → after bars');
 assert.equal(await js(`${card('plan-done')}.querySelector('.conv-show').textContent`),'Показать в Проводнике','Windows wording');
 assert.match(await js(`${card('plan-done')}.querySelector('.conv-error').textContent`),/Invalid data/);
 // An edit goes through the main process and repaints the chips; trim opens an inline editor.
 await js(`${card('plan-img')}.querySelectorAll('.conv-chips .kit-chip')[3].click()`);
 for(let i=0;i<50&&!(await js(`${card('plan-img')}.querySelectorAll('.conv-chips .kit-chip')[3].textContent==='Метаданные: убрать'`));i++)await new Promise(r=>setTimeout(r,30));
 assert.equal(conv.state.plans.get('plan-img').plan.params.strip,true,'the edit reached the plan in the main process');
 assert.ok(calls.filter(c=>c[0]==='thumbnail').length>=8);
 await js(`${card('plan-vid')}.querySelectorAll('.conv-chips .kit-chip')[4].click()`);
 assert.equal(await js(`${card('plan-vid')}.querySelectorAll('.conv-trim input').length`),2);
 await js(`${card('plan-vid')}.querySelectorAll('.conv-chips .kit-chip')[4].click()`);
 await new Promise(r=>setTimeout(r,500));
 assert.ok(ticks>0,'a running job is polled');
 await js(`${card('plan-run')}.querySelector('.kit-actions button').click()`);await new Promise(r=>setTimeout(r,100));
 assert.equal(controller.signal.aborted,true,'«Отменить» cancels the run');
 const shot=require('./card-shot.cjs');
 const file=await shot(win,'.conv-card[data-plan-id="plan-img"],.conv-card[data-plan-id="plan-vid"]','petya-converter');
 await js("document.getElementById('card-shot').remove()");
 const second=await shot(win,'.conv-card[data-plan-id="plan-run"],.conv-card[data-plan-id="plan-done"]','petya-converter-progress');
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('Converter cards ('+file+', '+second+'): thumbnails, chips, estimate, ffmpeg download, progress and cancel, results with bars, safe names passed');
}};
require('../src/main.cjs');
