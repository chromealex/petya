const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {app,BrowserWindow}=require('electron');
const base=__dirname;
const config=process.env.PETYA_MATERIAL_CONFIG?JSON.parse(fs.readFileSync(process.env.PETYA_MATERIAL_CONFIG,'utf8')):{};
config.suite??=process.argv[2]||process.env.PETYA_MATERIAL_SUITE||'code';
if(!['code','images'].includes(config.suite))throw Error('Suite must be code or images');
config.report??=process.env.PETYA_REPORT||path.join(require('node:os').tmpdir(),'petya-'+config.suite+'-results.json');
if(process.env.PETYA_MATERIAL_IDS)config.ids=process.env.PETYA_MATERIAL_IDS.split(',').map(Number);
const root=config.root||process.env.PETYA_ROOT||path.resolve(__dirname,'..');
const fixtureRoot=config.fixtures||path.join(base,'fixtures','material-analysis');
const {answerAttachments}=require(path.join(root,'src/attachment-assistant.cjs'));
const {Attachments}=require(path.join(root,'src/attachments.cjs'));
const {readImage}=require(path.join(root,'src/image-reader.cjs'));
app.commandLine.appendSwitch('disable-gpu');
app.on('window-all-closed',()=>{});
const normal=s=>String(s).replace(/ё/gi,'е');
const check=(c,answer)=>[...c.all.filter(r=>!new RegExp(normal(r),'iu').test(normal(answer.split('\n\nИсходные строки (дословно):')[0]))).map(r=>'Missing: '+r),...c.none.filter(r=>new RegExp(normal(r),'iu').test(normal(answer))).map(r=>'Forbidden: '+r)];
app.whenReady().then(async()=>{
 const cases=JSON.parse(fs.readFileSync(path.join(fixtureRoot,config.suite==='code'?'code-log-100.json':'image-analysis-100.json'),'utf8'));
 if(cases.length!==100||new Set(cases.map(c=>c.id)).size!==100)throw Error('Expected 100 distinct cases');
 const report={suite:config.suite,started:new Date().toISOString(),fixtureHash:crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),sourceHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/attachment-assistant.cjs'))).digest('hex'),results:[]};
 const save=()=>fs.writeFileSync(config.report,JSON.stringify(report,null,2)+'\n');
 let win;
 if(config.suite==='images'){
  win=new BrowserWindow({show:false,width:1000,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:!details.url.startsWith('file:')}));
  for(const file of [...new Set(cases.flatMap(c=>c.files.map(f=>f.path)))]){
   const png=path.join(fixtureRoot,file);
   if(!fs.existsSync(png)){
    await win.loadFile(png.replace(/\.png$/,'.html'));
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
    fs.writeFileSync(png,(await win.webContents.capturePage()).toPNG());
   }
  }
  win.destroy();
  if(config.renderOnly){console.log("Rendered 50 image fixtures");app.exit(0);return;}
 }
 let failures=0;
 for(const c of cases.filter(c=>!config.ids||config.ids.includes(c.id))){
  const started=Date.now();let answer='',errors=[],requests=0,models=[],traces=[],tokens=0;
  try{
   const intake=new Attachments({image:readImage});const ids=[];
   for(const f of c.files){const item=await intake.add(f.name,f.path?fs.readFileSync(path.join(fixtureRoot,f.path)):Buffer.from(f.text));ids.push(item.id);}
   const topic={attachments:intake.take(ids),messages:c.history||[],reviewScope:'Evaluation'};
   answer=await answerAttachments({settings:{model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat',speechStyle:'0'},topic,question:c.question,request:async(url,opts)=>{
    const data=opts?.body?JSON.parse(opts.body):null;if(url.endsWith('/api/chat')){requests++;models.push(data.model);}
    const response=await fetch(url,{...opts,signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('HTTP '+response.status+': '+await response.text());const body=await response.json();if(body.error)throw Error(body.error);tokens+=body.eval_count||0;if(url.endsWith('/api/chat'))traces.push({done:body.done_reason,tokens:body.eval_count,content:body.message?.content});return body;
   }});errors=check(c,answer);failures=0;
  }catch(e){errors=[e.message];failures++;}
  report.results.push({id:c.id,case:c.case,category:c.category,question:c.question,answer,errors,passed:!errors.length,requests,models,traces,tokens,ms:Date.now()-started});save();
  console.log(c.id+' '+c.case+' '+(!errors.length?'PASS':'FAIL '+errors.join('; ')));
  if(failures>=4)throw Error('Four consecutive transport/intake errors; saved partial report');
 }
 report.finished=new Date().toISOString();report.passed=report.results.filter(r=>r.passed).length;save();console.log('RESULT '+report.passed+'/'+report.results.length);app.exit(report.passed===report.results.length?0:1);
}).catch(e=>{console.error(e);app.exit(1)});
