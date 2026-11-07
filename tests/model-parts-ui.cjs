// The «Модели Пети» card sits in the settings and notifications come from the owner even with the settings closed.
module.exports=async win=>win.webContents.executeJavaScript(`(async()=>{
 const card=document.querySelector('[data-service="model-parts"]');if(!card||!card.closest('#settings-form'))throw Error('No model parts card in settings');
 if(!/Модели Пети/.test(card.querySelector('h2').textContent))throw Error('Card title');
 document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:{id:'model-part:andromeda:D1',title:'Модели Пети · D1',text:'Скачиваю',busy:true,version:'download'}}));
 return 'Model parts UI passed';
})()`).then(r=>console.log(r));
