// «Конвертер»: running a confirmed plan file by file. Each file gets its own state and percent (ffmpeg reports
// its position with -progress; other tools are 0 → 100), the whole run can be cancelled (the running tool is
// killed and its partial output removed), and sizes before and after are measured on disk.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ops=require('./ops.cjs');

// Spawns a tool; resolves with {stdout, stderr}; `onLine` gets stdout lines (ffmpeg -progress). Killed on abort.
function exec(bin,args,{signal,onLine,onErr,timeout=6*3600000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Object.assign(Error('Отменено.'),{cancelled:true}));
  const child=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='',rest='';
  const kill=()=>{try{child.kill(process.platform==='win32'?undefined:'SIGKILL');}catch{/* already gone */}};
  const timer=setTimeout(kill,timeout);signal?.addEventListener('abort',kill,{once:true});
  child.stdout.on('data',d=>{const s=d.toString();if(out.length<200000)out+=s;if(onLine){rest+=s;const lines=rest.split(/\r?\n/);rest=lines.pop();lines.forEach(onLine);}});
  child.stderr.on('data',d=>{const s=d.toString();if(err.length<200000)err+=s;onErr?.(s);});
  child.on('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);reject(e);});
  child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);
   if(signal?.aborted)return reject(Object.assign(Error('Отменено.'),{cancelled:true}));
   if(code!==0){const last=err.trim().split(/\r?\n/).filter(l=>!/^\s*(?:frame=|size=|Press \[q\])/.test(l)).slice(-2).join(' ').slice(0,300);return reject(Error((path.basename(bin).replace(/\.exe$/i,''))+' завершился с кодом '+code+(last?': '+last:'')));}
   resolve({stdout:out,stderr:err});});
 });
}
const durationIn=text=>{const m=String(text).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null;};
// Length of a video or sound in seconds: ffprobe when present, otherwise the «Duration:» line of `ffmpeg -i`.
async function probe(tools,input,signal){
 if(tools.ffprobe){try{const r=await exec(tools.ffprobe,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',input],{signal,timeout:60000});const n=Number(r.stdout.trim());if(n>0)return n;}catch(e){if(e.cancelled)throw e;}}
 // `ffmpeg -i` without an output always exits with an error; the length is in its stderr.
 if(tools.ffmpeg)return await new Promise(resolve=>{const c=spawn(tools.ffmpeg,['-hide_banner','-nostdin','-i',input],{windowsHide:true});let err='';const stop=()=>c.kill();signal?.addEventListener('abort',stop,{once:true});
  c.stderr.on('data',d=>{if(err.length<100000)err+=d;});c.on('error',()=>resolve(null));c.on('close',()=>{signal?.removeEventListener('abort',stop);resolve(durationIn(err));});});
 return null;
}
const size=p=>{try{return fs.statSync(p).size;}catch{return 0;}};
function move(from,to){try{fs.renameSync(from,to);}catch(e){if(e.code!=='EXDEV')throw e;fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);fs.rmSync(from,{force:true});}}

// Runs `job.files` in order. `publish(job)` after every change. Never overwrites: each output name is taken
// right before its file runs, and a tool that left nothing is an error.
async function run(job,plan,tools,{signal,publish=()=>{},platform=process.platform}={}){
 job.running=true;publish(job);
 for(const file of job.files){
  if(signal?.aborted){file.state='cancelled';continue;}
  file.state='running';file.percent=0;publish(job);
  let output='',tmp='';
  try{
   const wantsDuration=plan.kind==='video'||plan.kind==='audio';
   const duration=wantsDuration&&tools.ffmpeg?await probe(tools,file.input,signal):null;
   const cmd=ops.command(file.input,plan,tools,{platform,outDir:plan.outDir||'',duration});
   output=cmd.output;file.output=output;
   if(cmd.tmp)tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-convert-'));
   // An empty placeholder reserves the name while the tool works (a parallel run cannot take it).
   fs.writeFileSync(output,'',{flag:'wx'});
   const span=plan.params?.trim?plan.params.trim.end-plan.params.trim.start:duration;
   for(const step of cmd.steps){
    const args=step.args.map(a=>a==='{tmp}'?tmp:a);
    // Some tools (exiftool) refuse an existing output: the placeholder goes right before the tool writes.
    fs.rmSync(output,{force:true});
    await exec(step.bin,args,{signal,onLine:step.progress&&span?line=>{const m=line.match(/^out_time_(?:us|ms)=(\d+)/);if(m){const p=Math.min(99,Math.floor(Number(m[1])/1e6/span*100));if(p>file.percent){file.percent=p;publish(job);}}}:null});
    if(step.collect){const made=path.join(tmp,step.collect);if(!fs.existsSync(made))throw Error('Инструмент не создал файл.');fs.rmSync(output,{force:true});move(made,output);}
   }
   file.after=size(output);
   if(!file.after)throw Error('Инструмент не создал файл.');
   file.state='done';file.percent=100;
   // A target weight below what the picture needs: the result is the smallest sane one, said so in the card.
   if(plan.params?.targetBytes&&file.after>plan.params.targetBytes*1.05)file.warning='Не уложился в '+Math.round(plan.params.targetBytes/1024)+' КБ: это минимум без потери картинки. Укоротите видео или уменьшите высоту.';
  }catch(e){
   if(output){try{fs.rmSync(output,{force:true});}catch{/* nothing to remove */}}
   file.output='';
   if(e.cancelled||signal?.aborted){file.state='cancelled';}
   else{file.state='error';file.error=e.message;if(e.missing)file.missing=e.missing;}
  }finally{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});}
  publish(job);
 }
 job.running=false;job.cancelled=!!signal?.aborted;job.finishedAt=Date.now();publish(job);
 return job;
}
module.exports={run,exec,probe,durationIn};
