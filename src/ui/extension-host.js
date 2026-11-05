// Only bundled, validated extension descriptors can supply renderer scripts.
(()=>{
 const loaded=new Set();let entries=window.petyaExtensionDescriptors;
 const load=src=>new Promise((resolve,reject)=>{if(loaded.has(src))return resolve();const script=document.createElement('script');script.src=src;script.onload=()=>{loaded.add(src);resolve();};script.onerror=()=>reject(Error('Не удалось загрузить '+src));document.body.append(script);});
 function fold(card){
  if(card.classList.contains('settings-card'))return;
  const heading=card.querySelector('h2');if(!heading)return;
  const disclosure=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
  disclosure.className='settings-disclosure';body.className='settings-disclosure-body';summary.append(heading);body.append(...card.childNodes);disclosure.append(summary,body);card.append(disclosure);card.classList.add('settings-card');
 }
 async function mount(entry){
  for(const [file] of entry.scripts)await load('../extensions/'+entry.id+'/'+file);
  const card=document.querySelector('[data-extension="'+entry.id+'"]');if(card){card.hidden=entry.service?!moduleEnabled(entry.id):!entry.installed;fold(card);}
  document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:entry.id}));
  document.dispatchEvent(new Event('petya-extensions-changed'));return card;
 }
 window.extensionHost={async remove(id){entries=await window.petya.feature('extensionUI','uninstall',id);const card=document.querySelector('[data-extension="'+id+'"]');if(card)card.hidden=true;document.dispatchEvent(new Event('petya-extensions-changed'));},async render(parent,message){for(const entry of entries)for(const [key,handler] of Object.entries(entry.results||{})){const data=message.extensionData?.[key]||message[key];if(!data)continue;try{await mount(entry);window[handler]?.(parent,data);}catch(e){notice(e.message,true);}}},async open(id){entries=await window.petya.feature('extensionUI','install',id);const entry=entries.find(e=>e.id===id),card=await mount(entry);view('settings');if(card)window.revealSettings?.(card);else notice('Расширение добавлено. Используйте его в чате.');}};
 window.addEventListener('load',()=>{for(const card of document.querySelectorAll('[data-extension]'))fold(card);document.dispatchEvent(new Event('petya-extensions-changed'));});
 for(const entry of entries)if(entry.template){const form=document.getElementById('settings-form');form.querySelector(':scope>button[type=submit]').insertAdjacentHTML('beforebegin',entry.template);}
 const scripts=[];
 for(const node of document.querySelectorAll('script[type="application/petya-script"]')){
  scripts.push(node.dataset.src);
  for(const entry of entries)for(const [file,after] of entry.scripts){
   if(after===node.dataset.src&&(entry.service||entry.installed||file==='notifications.js'||!entry.settings))scripts.push('../extensions/'+entry.id+'/'+file);
  }
 }
 for(const src of scripts){loaded.add(src);document.write('<script src="'+src+'"><'+'/script>');}
})();
