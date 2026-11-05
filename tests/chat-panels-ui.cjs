const assert=require('node:assert/strict');
module.exports=async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js(`(async()=>{await window.chatNavigationReady;view('home');voiceReply=null;commandProgress.update('idle','');await selectDialogueTopic('');await window.tryBackgroundChat('Привет');for(let i=0;i<100&&window.chatJobBusy(topicSelect.value);i++)await new Promise(r=>setTimeout(r,20));})()`);
 await new Promise(r=>setTimeout(r,1500));
 await js(`(()=>{const content=dialogueMessages.querySelector('.message-assistant .message-content');const r=document.createRange();const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),nodes=[];let n;while(n=walker.nextNode())nodes.push(n);r.setStart(nodes[0],0);r.setEnd(nodes.at(-1),nodes.at(-1).length);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new MouseEvent('mouseup'));})()`);
 await new Promise(r=>setTimeout(r,200));await js("document.querySelector('.important-float').click()");await new Promise(r=>setTimeout(r,400));
 const before=await js(`(async()=>{const p=document.querySelector('.important-panel'),state=await window.petya.feature('highlights','list',topicSelect.value);return {saved:state.chat.length,shown:!p.hidden,header:!!p.closest('.chat-sticky-header'),open:p.open,marks:CSS.highlights.get('petya-important')?.size||0,id:topicSelect.value};})()`);
 assert.equal(before.saved,1);assert(before.shown&&before.header&&before.open);assert(before.marks>0,JSON.stringify(before));
 await js(`(async()=>{await selectDialogueTopic('');await selectDialogueTopic(${JSON.stringify(before.id)});})()`);await new Promise(r=>setTimeout(r,400));assert(await js("!document.querySelector('.important-panel').hidden"));
 await js(`(()=>{document.querySelector('.chat-project-context').open=true;const history=document.querySelector('.clarification-history');history.hidden=false;history.open=true;history.querySelector('div').textContent='Продолжение запроса · Остановлено';const search=document.querySelector('.chat-find');search.hidden=false;})()`);
 await js(`new Promise(resolve=>setTimeout(resolve,350))`);
 const bounds=await js(`(()=>{const shell=document.querySelector('.chat-shell').getBoundingClientRect();return ['.clarification-history>div','.chat-find','.important-panel'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return {q,inside:r.left>=shell.left&&r.right<=shell.right};});})()`);assert(bounds.every(x=>x.inside),JSON.stringify(bounds));
 await js(`(()=>{const dialog=document.querySelector('.git-project-dialog');const files=dialog.querySelector('.git-file-list');for(let i=0;i<35;i++){const label=document.createElement('label');label.className='check';const check=document.createElement('input');check.type='checkbox';label.append(check,document.createTextNode('M Assets/Scripts/Gameplay/Example'+i+'.cs'));files.append(label);}dialog.showModal();})()`);
 console.log('Selected text saved, visible in pinned panel, highlighted and restored after switching; panels stay inside chat');
};
