// Screenshot helper for extension card UI tests: moves the rendered cards into a full-window overlay
// (same page, same styles) and saves a PNG to the temp folder, so a card can be looked at, not only asserted.
// The overlay is untranslated like a chat message ([data-no-i18n]; card roots carry [data-i18n]), so moving a card
// there shows it as the chat does instead of translating what the chat would leave as written.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
module.exports=async(win,selector,name,{width=760}={})=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js(`(()=>{const box=document.createElement('div');box.id='card-shot';box.style.cssText='position:fixed;inset:0;z-index:2147483647;overflow:auto;background:var(--bg,#111);padding:20px 24px;display:flex;flex-direction:column;gap:4px;align-items:flex-start';
  const inner=document.createElement('div');inner.style.cssText='width:${width}px;max-width:100%';inner.dataset.noI18n='';box.append(inner);
  for(const node of document.querySelectorAll(${JSON.stringify(selector)}))inner.append(node);document.body.append(box);})()`);
 // A hidden smoke-test window keeps an old frame: show it and force a repaint before capturing.
 if(!win.isVisible())win.showInactive();
 win.webContents.invalidate();
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await new Promise(r=>setTimeout(r,300));
 const file=path.join(os.tmpdir(),name+'.png');
 fs.writeFileSync(file,(await win.webContents.capturePage()).toPNG());
 return file;
};
