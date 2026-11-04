const {BrowserWindow}=require('electron');const path=require('node:path');
const active=new Set();
const cancelVideo=()=>{for(const win of active)if(!win.isDestroyed())win.destroy();};
async function readVideo(bytes,name,{transcribe}={}){
 const win=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});active.add(win);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.setAudioMuted(true);
 const cancelled=new Promise((_,reject)=>win.once('closed',()=>reject(Error('Разбор видео отменён.'))));cancelled.catch(()=>{});
 const run=code=>{if(win.isDestroyed())throw Error('Разбор видео отменён.');return Promise.race([win.webContents.executeJavaScript(code),cancelled]);};let timer;
 try{
 const result=await Promise.race([(async()=>{await win.loadFile(path.join(__dirname,'ui/video-reader.html'));return run('window.readVideo('+JSON.stringify(bytes.filePath?'':bytes.toString('base64'))+','+JSON.stringify(name)+','+JSON.stringify(bytes.filePath?require('node:url').pathToFileURL(bytes.filePath).href:'')+')');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Не удалось извлечь кадры за 60 секунд. Проверьте формат видео (MP4/H.264 или WebM).')),60000);})]);clearTimeout(timer);
 let transcript='',chunks=0,silent=0,truncated=false;
 try{if(!transcribe)throw Error('Распознавание речи не подключено.');await run('window.startVideoAudio()');
 const queue=[];
 const collect=async()=>{const result=await queue.shift();if(result.error)throw result.error;const {part,text}=result;if(text?.trim()){const line='['+part.start.toFixed(1)+'–'+part.end.toFixed(1)+' с] '+text.trim()+'\n';if(transcript.length+line.length<=40000)transcript+=line;else truncated=true;}};
 while(true){const part=await run('window.nextVideoAudio()');if(part.wav){chunks++;if(part.silent)silent++;queue.push((async()=>{try{const text=part.silent?'':await Promise.race([transcribe(Buffer.from(part.wav,'base64')),cancelled]);if(win.isDestroyed())throw Error('Разбор видео отменён.');return {part,text};}catch(error){return {error};}})());if(queue.length>=2)await collect();}if(part.done)break;}
 while(queue.length)await collect();
 result.audio={status:'complete',chunks,silent,truncated};result.note+=' Звуковая дорожка обработана целиком: распознавание речи по фрагментам до 30 секунд.'+(truncated?' Расшифровка сокращена: часть речи не вошла в контекст.':'')+(!transcript?' Разборчивой речи не распознано; это не доказывает отсутствие звуков.':'');}
 catch(error){if(win.isDestroyed())throw Error('Разбор видео отменён.');result.audio={status:'error',error:error.message,chunks};result.note+=' Звук разобран не полностью: '+error.message;}
 if(transcript)result.text='Распознанная речь (возможны ошибки; метки относятся к фрагментам, а не отдельным словам):\n'+transcript;
 return result;
 }finally{clearTimeout(timer);active.delete(win);if(!win.isDestroyed())win.destroy();}
}
module.exports={readVideo,cancelVideo};
