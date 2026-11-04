(()=>{
 const name=document.getElementById('user-name'),variants=document.getElementById('user-name-variants'),preview=document.getElementById('user-name-preview');
 const render=()=>{try{const profile=NameProfile.validate(name.value,variants.value,document.getElementById('user-name-excluded').value);preview.textContent=profile.name?'Можно обращаться: '+[profile.addressName,...profile.variants].filter(Boolean).join(', ')+'. Не в каждом ответе.':'Без имени Петя не будет придумывать обращение.';}catch(e){preview.textContent=e.message;}};
 name.addEventListener('input',()=>{variants.value='';render();});variants.addEventListener('input',render);document.getElementById('user-name-excluded').addEventListener('input',render);document.addEventListener('petya-settings-displayed',render);render();
})();
