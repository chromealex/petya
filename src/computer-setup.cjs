// Computer control: overlay, access, natural-language intents, approvals and IPC.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const controlOverlay=new (require('./computer-overlay.cjs').ComputerOverlay)({BrowserWindow:ctx.BrowserWindow,screen:require('electron').screen});
  const computerFile=ctx.path.join(ctx.app.getPath('userData'),'computer-access.json');
  const computer=new (require('./computer-control.cjs').ComputerControl)({
    visual:ctx.smoke?null:controlOverlay,
    access:()=>process.platform!=='darwin'||ctx.systemPreferences.isTrustedAccessibilityClient(false),
    load:()=>ctx.smoke?null:(ctx.fs.existsSync(computerFile)?JSON.parse(ctx.fs.readFileSync(computerFile,'utf8')):null),
    save:value=>{if(ctx.smoke)return;ctx.fs.writeFileSync(computerFile+'.tmp',JSON.stringify(value),{mode:0o600});ctx.fs.renameSync(computerFile+'.tmp',computerFile);}
  });
  // A screenshot of an app window (or the screen) goes into the chat as an image and into the attachments, so the
  // next question can be about it. macOS asks the user for screen recording first; Petya opens that setting.
  const capture=async({app,command})=>{
    const {desktopCapturer,systemPreferences,shell}=require('electron');
    const allowed=()=>process.platform!=='darwin'||systemPreferences.getMediaAccessStatus('screen')==='granted';
    if(!allowed()){await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1,height:1}}).catch(()=>{});
      if(!allowed()){if(!ctx.smoke)await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch(()=>{});
        return {handled:true,question:true,text:'Чтобы сделать скриншот'+(app?' '+app:'')+', разрешите Пете запись экрана: я открыл «Системные настройки → Конфиденциальность и безопасность → Запись экрана». Включите там Петю и повторите просьбу.'};}}
    const sources=await desktopCapturer.getSources({types:app?['window']:['screen'],thumbnailSize:{width:2560,height:1600}});
    const words=String(app).toLowerCase().split(/\s+/).filter(Boolean);
    const source=app?sources.filter(x=>words.every(w=>x.name.toLowerCase().includes(w))&&!x.thumbnail.isEmpty()).sort((a,b)=>b.thumbnail.getSize().width*b.thumbnail.getSize().height-a.thumbnail.getSize().width*a.thumbnail.getSize().height)[0]:sources[0];
    if(!source)return {handled:true,text:'Не нашёл открытое окно '+app+'. Откройте его (не свёрнутым) и повторите просьбу.'};
    const png=source.thumbnail.toPNG(),size=source.thumbnail.getSize(),name=(app||'Экран')+' '+new Date().toLocaleString('ru-RU').replace(/[/:]/g,'-')+'.png';
    try{await ctx.attachments.add(name,png);}catch{}
    const text='Сделал скриншот '+(app||'экрана')+'. Он во вложениях этого чата — спросите, что на нём посмотреть.';
    ctx.dialogue.rememberAction(command,text);const topic=ctx.dialogue.active(),last=topic?.messages?.at(-1);
    if(last?.role==='assistant'){last.generatedImage={png:png.toString('base64'),prompt:'Скриншот '+(app||'экрана'),model:'снимок экрана',width:size.width,height:size.height};last.by='управление компьютером';ctx.dialogue.persist();}
    return {handled:true,text,topicId:topic?.id,topicTitle:topic?.title,messages:topic?.messages};
  };
  const computerIntent=new (require('./computer-intent.cjs').ComputerIntent)({computer,model:async command=>{
    if(!ctx.settings.model)return null;
    const base=new URL(ctx.core.localEndpoint(ctx.settings.ollamaUrl));
    const info=await ctx.request(new URL('/api/show',base).href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:ctx.settings.model})});
    if(info.remote_host||info.remote_model||/cloud/i.test(ctx.settings.model))throw Error('Нужна локальная модель.');
    return ctx.request(base.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./computer-intent.cjs').routingRequest(ctx.settings.model,command))});
  },capture});
  const computerApproval=new (require('./computer-approval.cjs').ComputerApproval)({computer,scope:()=>JSON.stringify([ctx.companyId,ctx.dialogue.state.activeProjectId,ctx.dialogue.state.activeId]),execute:async(command,action)=>{if(action?.type==='teamFillScreen')return ctx.teamFill.fromScreen(command);if(action?.type==='slackDigestScreen')return ctx.slackDigest.fromScreen(command);if(action?.type==='search'&&action.service==='telegram'){const query=require('./computer-intent.cjs').direct(command)?.query||action.query;const result=await computerIntent.search(query);return require('./extensions/telegram/contact-result.cjs').remember(ctx.dialogue,command,result,true,ctx.settings);}const result=await computer.execute(action);const rows=(result.observation?.results||[]).slice(0,12);return {handled:true,text:result.text+(rows.length?'\nНа экране:\n'+rows.map(r=>r.text).join('\n'):result.observation?.empty?'\nНичего не найдено.':'')};}});
  ctx.handle('computerApprove',async(id,allow)=>{
    const topic=ctx.dialogue.active();
    const result=await computerApproval.decide(id,allow);
    if(result.needsSystemPermission){
      result.text='Разрешите Пете универсальный доступ в настройках macOS. После возвращения запрос продолжится автоматически.';
      if(topic?.lastChatResult?.computerApproval===id){if(topic.messages.at(-1)?.text!==result.text)topic.messages.push({role:'assistant',text:result.text,at:Date.now()});ctx.dialogue.persist();return {...result,messages:topic.messages};}
    }
    if(!result.needsSystemPermission&&topic?.lastChatResult?.computerApproval===id){
      const last=topic.messages.at(-1);
      if(result.text&&(last?.role!=='assistant'||last.text!==result.text))topic.messages.push({role:'assistant',text:result.text,at:Date.now(),error:!!result.error});
      topic.lastChatResult={...result,topicId:topic.id,messages:undefined,topics:undefined};
      if(topic.chatJob)topic.chatJob={...topic.chatJob,state:result.question?'attention':'done',label:result.question?'Нужно уточнение':'Готово',at:Date.now()};
      ctx.dialogue.persist();
      return {...result,topicId:topic.id,messages:topic.messages};
    }
    return result;
  });
  ctx.handle('computerStatus',()=>computer.status());
  ctx.handle('computerApps',()=>computer.apps());
  ctx.handle('computerStart',options=>computer.start(options));
  ctx.handle('computerStop',()=>computer.stop());
  ctx.handle('computerAction',action=>computer.execute(action));
  ctx.handle('computerCommand',async value=>{const command=ctx.text(value,4000);const result=await computer.command(command)||await computerIntent.turn(command);if(!result)throw Error('Неизвестная команда управления. Используйте примеры под полем.');return result;});
  ctx.handle('computerPermission',()=>{if(process.platform==='darwin')ctx.systemPreferences.isTrustedAccessibilityClient(true);return computer.status();});
  require('electron').globalShortcut.register('CommandOrControl+Shift+F12',()=>computer.stop());
  ctx.app.on('before-quit',()=>{computer.suspend();controlOverlay.dispose();});
  ctx.powerMonitor.on('lock-screen',()=>computer.suspend());
  return {computer,computerApproval,computerIntent};
};
