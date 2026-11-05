const fs=require('node:fs'),path=require('node:path');
const {ZoomBot}=require('./controller.cjs');
function validate(next){
 if(!['off','ask','auto'].includes(next.zoomBotMode)||!['bot','local'].includes(next.zoomCaptureMode))throw Error('Проверьте режим подключения Zoom.');
 if(next.zoomBotUrl){const u=new URL(next.zoomBotUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Сервис Zoom должен использовать HTTPS.');}
}
module.exports={name:'zoomBot',defaults:{zoomBotMode:'auto',zoomCaptureMode:'bot',zoomBotUrl:'',zoomBotCredential:'',zoomCredential:''},secrets:['zoomBotCredential','zoomCredential'],validate,
 setup(s){
  const {app,safeStorage,shell}=require('electron'),file=path.join(s.dataRoot,'zoom-bot-state.enc');
  const oauth=new (require('../../service-oauth.cjs').ServiceOAuth)('zoom',s.request);
  const bot=new ZoomBot({settings:()=>s.settings,inspect:link=>require('../../meeting-monitor.cjs').desktopState({meetingLink:link}),
   load:()=>fs.existsSync(file)?JSON.parse(safeStorage.decryptString(fs.readFileSync(file))):null,
   persist:state=>{if(!safeStorage.isEncryptionAvailable())throw Error('Хранилище ОС недоступно.');fs.writeFileSync(file+'.tmp',safeStorage.encryptString(JSON.stringify(state)),{mode:0o600});fs.renameSync(file+'.tmp',file);},
   emit:state=>{if(s.win&&!s.win.isDestroyed())s.win.webContents.send('zoom-bot-progress',state);},
   save:rows=>s.memory.put(rows),transcribe:bytes=>require('../../voice-setup.cjs').transcribe(s,bytes),
   remote:async(method,route,data)=>{
    const config=s.settings;validate(config);if(!config.zoomBotUrl||!config.zoomBotCredential)throw Error('Сервис участника Пети ещё не подключён. Настройте Zoom в подключениях. Микрофон компьютера не используется.');
    if(route==='/v1/bots'&&method==='POST'){if(!config.zoomCredential)throw Error('Войдите в Zoom в настройках подключения Пети.');data={...data,oauthCredential:config.zoomCredential};}
    const response=await fetch(config.zoomBotUrl.replace(/\/$/,'')+route,{method,headers:{Authorization:'Bearer '+config.zoomBotCredential,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(response.status===503?'Сервис Zoom ещё не готов: требуется приложение Zoom и Meeting SDK.':'Сервис Zoom вернул HTTP '+response.status);
    const text=await response.text();if(text.length>10*1024*1024)throw Error('Слишком большой ответ сервиса Zoom.');return JSON.parse(text);
   }
  });
  let stopped=false;const tick=()=>{if(!stopped&&process.env.PETYA_VERIFY_BUILD!=='1')bot.tick().catch(()=>{});};
  const timer=setInterval(tick,5000);timer.unref();app.once('before-quit',()=>{stopped=true;clearInterval(timer);});
  const status=()=>({...bot.snapshot(),mode:s.settings.zoomBotMode,capture:s.settings.zoomCaptureMode,configured:!!(s.settings.zoomBotUrl&&s.settings.zoomBotCredential),url:s.settings.zoomBotUrl,connected:!!s.settings.zoomCredential});
  const configure=input=>{if(bot.snapshot().busy)throw Error('Дождитесь окончания текущей записи или обработки Zoom.');const values={zoomBotMode:input.mode,zoomCaptureMode:input.capture};if(typeof input.url==='string')values.zoomBotUrl=input.url;if(input.credential)values.zoomBotCredential=input.credential;s.saveSettings(values,true);return status();};
  const ipc={status,configure,async signIn(){const result=await oauth.start();await shell.openExternal(result.url);return result;},completeSignIn:()=>oauth.poll(),async claim(siteId){const result=await oauth.claim(siteId);s.saveSettings({zoomCredential:result.credential},true);return status();},join:id=>bot.action('join',id),dismiss:id=>bot.action('dismiss',id),retry:id=>bot.action('retry',id)};
  return {ipc,zoomBot:(method,...args)=>{if(!['status','join','dismiss','retry'].includes(method))throw Error('Настройки подключения меняются только в Пете.');return ipc[method](...args);}};
 },
 register(server,z,ctx){for(const method of ['status','join','dismiss','retry'])server.registerTool('zoom_bot_'+method,{
  description:method==='status'?'Состояние обнаружения встречи и участника Пети.':method==='join'?'Подключить Петю к обнаруженной встрече. В режиме подтверждения требуется подтверждение в приложении.':method==='dismiss'?'Не подключать Петю к текущей обнаруженной встрече.':'Повторить получение ссылки или проверку записи. Ручное подтверждение входа остаётся в Пете.',
  inputSchema:method==='status'?{}:{id:z.string().min(1).max(200)},annotations:{readOnlyHint:method==='status',destructiveHint:false,openWorldHint:method!=='status'}
 },async args=>{try{ctx.check();if(ctx.access?.projectId||method!=='status'&&ctx.access?.mode!=='edit')throw Error('Нужен доступ MCP ко всей компании с соответствующими правами.');
  return await ctx.run(async()=>{ctx.check();const state=await ctx.zoomBot('status');if(['join','retry'].includes(method)&&state.mode!=='auto')throw Error('Подтвердите вход Пети в приложении.');return {content:[{type:'text',text:JSON.stringify(await ctx.zoomBot(method,...(method==='status'?[]:[args.id])))}]};});
 }catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});}
};
