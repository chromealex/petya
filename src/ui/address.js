// Settings: grammatical gender of the user («ты сделал / сделала»), next to the name settings.
(()=>{
 const preview=document.getElementById('user-name-preview');if(!preview)return;
 const label=document.createElement('label');label.className='small address-gender';label.textContent='Обращаться: ';
 const select=document.createElement('select');select.setAttribute('aria-label','Род в обращении');
 for(const [value,text] of [['','по имени'],['m','в мужском роде'],['f','в женском роде']])select.append(new Option(text,value));
 label.append(select);preview.after(label);
 const load=()=>window.petya.settings().then(s=>{select.value=s.userGender||'';}).catch(()=>{});
 select.onchange=()=>window.petya.saveSettings({userGender:select.value}).then(()=>notice(select.value?'Обращение сохранено.':'Род определяется по имени.')).catch(e=>notice(e.message,true));
 document.addEventListener('petya-settings-displayed',load);load();
})();
