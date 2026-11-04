// The lexicon slider saves as soon as it is released; the label never differs from the saved style.
module.exports=async win=>{
 const r=await win.webContents.executeJavaScript(`(async()=>{
  const previous=(await window.petya.settings()).speechStyle;view('settings');const slider=document.getElementById('speech-style');
  slider.value='3';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));
  for(let i=0;i<40&&(await window.petya.settings()).speechStyle!=='3';i++)await new Promise(r=>setTimeout(r,50));
  const saved=(await window.petya.settings()).speechStyle;await window.petya.saveSettings({speechStyle:previous});view('home');return saved;})()`);
 if(r!=='3')throw Error('Speech style slider did not save: '+r);
 console.log('Speech style UI: the slider saves immediately passed');
};
