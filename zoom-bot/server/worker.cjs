// Raw frames arrive on fd 3. Only encrypted PCM-derived WAV segments reach disk.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {Store}=require('./store.cjs');
function wav(pcm,rate){const count=Math.floor(pcm.length/2*16000/rate),out=Buffer.alloc(44+count*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(16000,24);out.writeUInt32LE(32000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*2,40);for(let i=0;i<count;i++){const start=Math.floor(i*rate/16000),end=Math.min(pcm.length/2,Math.max(start+1,Math.floor((i+1)*rate/16000)));let sum=0;for(let j=start;j<end;j++)sum+=pcm.readInt16LE(j*2);out.writeInt16LE(Math.round(sum/Math.max(1,end-start)),44+i*2);}return out;}
class Frames {
 constructor(save){this.save=save;this.pending=Buffer.alloc(0);this.audio=[];this.size=0;this.rate=0;this.index=0;this.at=0;}
 flush(){if(!this.size)return;this.save(this.index++,{wav:wav(Buffer.concat(this.audio),this.rate).toString('base64'),at:this.at});this.audio=[];this.size=0;}
 push(bytes){this.pending=Buffer.concat([this.pending,bytes]);while(this.pending.length>=8){const rate=this.pending.readUInt32LE(0),length=this.pending.readUInt32LE(4);if(![8000,16000,32000,48000].includes(rate)||length>2e6||length%2)throw Error('Invalid audio frame');if(this.pending.length<8+length)return;if(this.rate&&this.rate!==rate)this.flush();this.rate=rate;if(!this.size)this.at=Date.now();this.audio.push(Buffer.from(this.pending.subarray(8,8+length)));this.size+=length;this.pending=this.pending.subarray(8+length);if(this.size>=rate*2*8)this.flush();}}
 end(){if(this.pending.length)throw Error('Incomplete audio frame');this.flush();}
}
async function main(){
 let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>16000)throw Error('Input too large');}const {id,meeting}=JSON.parse(text);
 const store=new Store(process.env.ZOOM_DATA_DIR||'/var/lib/petya-zoom',process.env.ZOOM_STORAGE_KEY||'');
 const tokenResponse=await fetch('http://127.0.0.1:8787/zoom/v1/token',{method:'POST',headers:{Authorization:'Bearer '+meeting.oauthCredential},signal:AbortSignal.timeout(15000)});
 if(!tokenResponse.ok)throw Error('ZOOM_OAUTH_'+tokenResponse.status);const token=await tokenResponse.json();if(token.site?.provider!=='zoom')throw Error('Wrong provider');
 const response=await fetch('https://api.zoom.us/v2/users/me/token?'+new URLSearchParams({type:'onbehalf',meeting_id:meeting.meetingId}),{headers:{Authorization:'Bearer '+token.accessToken},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('ZOOM_OBF_'+response.status);const obf=await response.json();if(typeof obf.token!=='string'||!obf.token)throw Error('Missing OBF token');
 // A private tmpfs file avoids exposing credentials through process arguments or disk.
 const temp=fs.mkdtempSync('/dev/shm/petya-zoom-');fs.chmodSync(temp,0o700);const config=path.join(temp,'config.toml');
 const values={'client-id':process.env.ZOOM_CLIENT_ID,'client-secret':process.env.ZOOM_CLIENT_SECRET,'meeting-id':meeting.meetingId,password:meeting.password,'display-name':'Петя','on-behalf':obf.token};
 const url=new URL(meeting.url);if(url.searchParams.get('pwd'))values['join-url']=meeting.url;
 fs.writeFileSync(config,Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v||'')).join('\n')+'\n[RawAudio]\nfile="pipe"\n',{mode:0o600});
 const publish=data=>process.stdout.write(JSON.stringify(data)+'\n');
 const frames=new Frames((index,data)=>store.write(id+'-'+index,data));
 try{
  await new Promise((resolve,reject)=>{
   const child=spawn(process.env.ZOOM_SDK_BINARY,['--config',config],{cwd:path.dirname(process.env.ZOOM_SDK_BINARY),stdio:['ignore','pipe','ignore','pipe'],env:{...process.env,PETYA_RAW_PIPE:'1'}});
   let pending='',ended=false,sdkFailure='';const limit=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Meeting exceeded 12 hours'));},12*60*60*1000);
   const startup=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Zoom did not grant recording access'));},10*60*1000);
   child.stdout.on('data',chunk=>{pending=(pending+chunk).slice(-65536);let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(/^PETYA:failure:(auth|meeting):-?\d{1,6}$/.test(line))sdkFailure=line;if(line==='PETYA:waiting')publish({phase:'waiting'});if(line==='PETYA:recording'){clearTimeout(startup);publish({phase:'recording'});}if(line==='PETYA:ended'){ended=true;clearTimeout(startup);}}});
   child.stdio[3].on('data',chunk=>{try{frames.push(chunk);}catch(e){child.kill('SIGTERM');reject(e);}});
   child.on('error',reject);child.on('close',code=>{clearTimeout(limit);clearTimeout(startup);if(ended&&code===0){try{frames.end();resolve();}catch(e){reject(e);}}else reject(Error(sdkFailure||'Zoom recording interrupted'));});
   process.once('SIGTERM',()=>child.kill('SIGTERM'));
  });
  publish({phase:'recorded',segments:frames.index});
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function failureMessage(error){
 const message=String(error?.message||'');
 const sdk=message.match(/^PETYA:failure:(auth|meeting):(-?\d{1,6})$/);
 if(sdk?.[1]==='meeting'&&sdk[2]==='63')return 'Zoom запретил вход во встречу внешнего аккаунта (код 63). Пока приложение проходит проверку, создайте встречу аккаунтом разработчика Petya.';
 if(sdk?.[1]==='meeting'&&sdk[2]==='501')return 'Аккаунт, подключённый в Пете, отсутствует во встрече Zoom (код 501). Войдите в текущую встречу этим аккаунтом.';
 if(sdk)return 'Zoom SDK отклонил '+(sdk[1]==='auth'?'авторизацию приложения':'вход во встречу')+' (код '+sdk[2]+').';
 const status=message.match(/^ZOOM_(OAUTH|OBF)_(\d{3})$/);
 if(status)return (status[1]==='OAUTH'?'Не удалось получить авторизацию аккаунта Zoom':'Zoom отказал в выдаче токена для входа в эту встречу')+' (HTTP '+status[2]+'). Проверьте аккаунт, подключённый в Пете.';
 if(message==='Zoom recording interrupted')return 'Zoom SDK завершил подключение без записи. Проверьте допуск бота и разрешение организатора.';
 if(message==='Zoom did not grant recording access')return 'Zoom не предоставил доступ к записи за 10 минут. Проверьте зал ожидания и разрешение организатора.';
 return 'Запись Zoom не завершена. Проверьте авторизацию участника и разрешение записи.';
}
if(require.main===module)main().catch(error=>{process.stdout.write(JSON.stringify({phase:'error',message:failureMessage(error)})+'\n');process.exitCode=1;});
module.exports={wav,Frames,failureMessage};
