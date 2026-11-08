// Electron integration test: run main with PETYA_SMOKE_TEST=1 PETYA_COMPANY_SWITCH_TEST=1.
const assert=require('node:assert/strict');
module.exports=async(win,app)=>{
 const pid=process.pid,id=win.id;
 const run=code=>win.webContents.executeJavaScript(code);
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const originalRelaunch=app.relaunch;app.relaunch=()=>{throw Error('Company switch must not relaunch');};
 const originalQuit=app.quit;app.quit=()=>{throw Error('Company switch must not quit');};
 async function switchTo(target){
  for(let n=0;n<300;n++){
   try{const result=await run(`window.petya.companySwitch(${JSON.stringify(target)})`);assert(result.switching);break;}
   catch(error){if(!/завершает|Обновляются/.test(error.message)||n===299)throw error;await delay(100);}
  }
  for(let n=0;n<300;n++){
   await delay(25);
   try{const state=await run(`window.petya.companies()`);if(state.activeId===target&&await run(`document.querySelector('#company-tabs [aria-current]')?.dataset.companyId===${JSON.stringify(target)}`))return;}
   catch{}
  }
  throw Error('Company did not load: '+target);
 }
 try{
  await delay(500);
  await run(`window.petya.saveSettings({userName:'Первая',meetingAutoRecord:'off'})`);
  await run(`window.petya.addContext({source:'Заметка',title:'Only first',text:'Private first company'})`);
  await run(`window.petya.chatDraftSet('draft:general','Черновик первой компании')`);
  const second=await run(`window.petya.companyCreate('Вторая')`);
  const originalListeners=app.listenerCount('will-quit');
  const endpoint=await run(`window.petya.mcpStart({mode:'read',projectId:''})`);
  assert(endpoint.enabled);
  await switchTo(second.id);
  assert.equal(process.pid,pid);assert.equal(win.id,id);assert(!win.isDestroyed());
  assert.equal((await run(`window.petya.settings()`)).userName,'');
  assert(!(await run(`window.petya.chatDrafts()`))['draft:general']);
  assert(!(await run(`window.petya.contexts()`)).some(c=>c.title==='Only first'));
  assert.equal((await run(`window.petya.mcpStatus()`)).enabled,false);
  await assert.rejects(fetch(endpoint.url,{method:'POST'}));
  await run(`window.petya.saveSettings({userName:'Вторая',meetingAutoRecord:'off'})`);
  await run(`window.petya.addContext({source:'Заметка',title:'Only second',text:'Private second company'})`);
  await switchTo('default');
  assert.equal((await run(`window.petya.settings()`)).userName,'Первая');
  assert.equal((await run(`window.petya.chatDrafts()`))['draft:general'],'Черновик первой компании');
  const contexts=await run(`window.petya.contexts()`);assert(contexts.some(c=>c.title==='Only first'));assert(!contexts.some(c=>c.title==='Only second'));
  assert.equal(app.listenerCount('will-quit'),originalListeners);
  await switchTo(second.id);assert.equal((await run(`window.petya.settings()`)).userName,'Вторая');
  await switchTo('default');assert.equal(app.listenerCount('will-quit'),originalListeners);
  const broken=await run(`window.petya.companyCreate('Повреждённый профиль')`);
  const fs=require('node:fs'),path=require('node:path'),{dialog}=require('electron');
  fs.writeFileSync(path.join(app.getPath('userData'),'companies',broken.id,'settings.json'),'{broken');
  const showError=dialog.showErrorBox;let reported='';dialog.showErrorBox=(_title,message)=>{reported=message;};
  try{
   const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
   for(let n=0;n<300;n++){
    try{await run(`window.petya.companySwitch(${JSON.stringify(broken.id)})`);break;}
    catch(error){if(!/завершает|Обновляются/.test(error.message)||n===299)throw error;await delay(100);}
   }
   await loaded;
   assert(reported);assert.equal((await run(`window.petya.companies()`)).activeId,'default');
   assert.equal((await run(`window.petya.settings()`)).userName,'Первая');
   assert.equal((await run(`window.petya.chatDrafts()`))['draft:general'],'Черновик первой компании');
   assert.equal(app.listenerCount('will-quit'),originalListeners);
  }finally{dialog.showErrorBox=showError;}
  console.log('Company switching: same process/window, isolated settings/context/drafts, revoked MCP, stable listeners and rollback after invalid profile');
 }finally{app.relaunch=originalRelaunch;app.quit=originalQuit;}
};
