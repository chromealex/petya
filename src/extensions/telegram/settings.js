(() => {
 // The person's Telegram account (from a Slack profile or a contact search) is a row of «В сервисах» on «Команда».
 window.petyaTeamIdentities ||= {list:[],register(identity){if(identity?.service&&!this.list.some(i=>i.service===identity.service))this.list.push(identity);}};
 window.petyaTeamIdentities.register({service:'telegram',title:'Telegram',order:20});
 // Telegram card: one «Подключить» shows a QR code to scan in the Telegram app; the chosen chats save on click.
 const card=document.createElement('article');card.className='card';card.dataset.service='telegram';card.hidden=!moduleEnabled('telegram');
 card.innerHTML=`<h2>Telegram · личный аккаунт</h2><p>Источник текстового контекста из выбранных чатов и каналов этой компании. Без отправки сообщений и отметок прочтения. Секретные чаты недоступны.</p>
 <div id="tg-login"><div id="tg-app" hidden><p class="small">Один раз укажите приложение Telegram: войдите на my.telegram.org, откройте «API development tools» и скопируйте api_id и api_hash.</p><label>api_id<input id="tg-api-id" inputmode="numeric" autocomplete="off"></label><label>api_hash<input id="tg-api-hash" type="password" autocomplete="off"></label><button type="button" id="tg-guide">Открыть my.telegram.org</button></div>
 <button type="button" id="tg-connect" class="primary">Подключить</button> <button type="button" id="tg-phone-open">Войти по номеру телефона</button>
 <div id="tg-phone-step" hidden><label>Номер телефона<input id="tg-phone" type="tel" placeholder="+79991234567" autocomplete="tel"></label><button type="button" id="tg-start">Получить код</button></div></div>
 <div id="tg-qr" hidden><div id="tg-qr-image" class="tg-qr-image"></div></div>
 <div id="tg-challenge" hidden><label id="tg-challenge-label" for="tg-answer">Код Telegram</label><input id="tg-answer" type="password" autocomplete="off"><button type="button" id="tg-submit">Продолжить</button></div><button type="button" id="tg-cancel" hidden>Отменить вход</button>
 <div id="tg-connected" hidden><p id="tg-account"></p><p class="small">Отметьте рабочие чаты — выбор сохраняется сразу (до 20).</p><div id="tg-chats"></div><p id="tg-limit" class="small"></p><button type="button" id="tg-sync">Обновить контекст</button><label class="check"><input type="checkbox" id="tg-auto">Обновлять автоматически каждые 5 минут</label><button type="button" id="tg-disconnect">Отключить аккаунт</button></div>
 <p id="tg-status" class="connection-status" role="status"></p>`;
 if(!document.getElementById('tg-qr-style')){const style=document.createElement('style');style.id='tg-qr-style';style.textContent='.tg-qr-image{width:200px;height:200px;margin:8px 0;border-radius:12px;overflow:hidden;background:#fff}.tg-qr-image svg{width:100%;height:100%;display:block}';document.head.append(style);}
 $('settings-form').insertBefore(card,$('settings-form').lastElementChild);let phase='',selected=[],chats=[],polling=false,builtIn=false,hasApp=false,loaded=false;
 const LIVE=['connecting','qr','code','password','email','emailCode'];
 function drawChats(){const box=$('tg-chats');box.replaceChildren();const all=new Map([...selected,...chats].map(c=>[c.id,c]));for(const chat of all.values()){const label=document.createElement('label');label.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=selected.some(c=>c.id===chat.id);
  check.onchange=run(async()=>{const next=check.checked?[...selected,chat]:selected.filter(c=>c.id!==chat.id);if(next.length>20){check.checked=false;throw Error('Можно выбрать до 20 чатов.');}selected=next;render(await window.petya.telegramSelect(selected.map(c=>c.id)));notice('Чаты Telegram сохранены.');});
  label.append(check,document.createTextNode(chat.title));box.append(label);}}
 async function loadChats(){if(loaded)return;loaded=true;try{const result=await window.petya.telegramDialogs();chats=result.chats;drawChats();$('tg-limit').textContent=result.limited?'Показаны первые 200 чатов.':'';}catch(e){loaded=false;$('tg-limit').textContent=e.message;}}
 function render(state){phase=state.phase;hasApp=builtIn||state.app;const challenge=['code','password','email','emailCode'].includes(phase),pending=LIVE.includes(phase);
  $('tg-login').hidden=state.connected||pending;$('tg-app').hidden=hasApp;$('tg-connected').hidden=!state.connected;$('tg-challenge').hidden=!challenge;$('tg-cancel').hidden=!pending;
  $('tg-qr').hidden=phase!=='qr'||!state.qr;if(phase==='qr'&&state.qr&&$('tg-qr-image').dataset.code!==state.qr){$('tg-qr-image').innerHTML=state.qr;$('tg-qr-image').dataset.code=state.qr;}
  $('tg-challenge-label').textContent=({code:'Код из Telegram',password:'Пароль двухэтапной проверки',email:'Email для проверки Telegram',emailCode:'Код из email'})[phase]||'';
  $('tg-status').textContent=state.message||(state.connected?'Подключено':'Не подключено');$('tg-status').className='connection-status '+(phase==='error'?'error':state.connected?'connected':'disconnected');$('tg-account').textContent=state.account||'';
  if(state.connected)loadChats();else loaded=false;return pending;}
 async function refresh(){const state=await window.petya.telegramStatus();selected=state.selected;render(state);drawChats();$('tg-auto').checked=(await window.petya.settings()).telegramAutoSync==='true';}
 const app=()=>({apiId:$('tg-api-id').value.trim(),apiHash:$('tg-api-hash').value.trim()});
 window.petya.integrationClients().then(s=>{builtIn=s.telegram;}).catch(()=>{}).finally(()=>refresh().catch(e=>notice(e.message,true)));
 $('tg-connect').onclick=run(async()=>{if(!hasApp&&!(app().apiId&&app().apiHash)){$('tg-app').hidden=false;$('tg-api-id').focus();throw Error('Укажите api_id и api_hash приложения Telegram — это нужно один раз.');}try{render(await window.petya.telegramQr(app()));}finally{$('tg-api-hash').value='';}});
 $('tg-phone-open').onclick=()=>{$('tg-phone-step').hidden=false;$('tg-phone').focus();};
 $('tg-guide').onclick=run(()=>window.petya.telegramGuide());
 $('tg-start').onclick=run(async()=>{const input={...app(),phone:$('tg-phone').value.trim()};try{render(await window.petya.telegramStart(input));}finally{$('tg-api-hash').value='';}});
 $('tg-submit').onclick=run(async()=>{const value=$('tg-answer').value;$('tg-answer').value='';render(await window.petya.telegramRespond(phase,value));});
 $('tg-answer').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('tg-submit').click();}};
 $('tg-cancel').onclick=run(async()=>{await window.petya.telegramCancel();$('tg-answer').value='';await refresh();});
 $('tg-disconnect').onclick=run(async()=>{await window.petya.telegramDisconnect();selected=[];chats=[];await refresh();});
 $('tg-sync').onclick=run(async()=>{render(await window.petya.telegramSync());await refreshContexts();});
 $('tg-auto').onchange=run(async()=>{await window.petya.saveSettings({telegramAutoSync:String($('tg-auto').checked)});});
 document.addEventListener('petya-modules-changed',()=>{card.hidden=!moduleEnabled('telegram');});
 setInterval(async()=>{if(polling||card.hidden||!LIVE.includes(phase))return;polling=true;try{const state=await window.petya.telegramStatus();if(!render(state)){selected=state.selected;drawChats();}}catch{}finally{polling=false;}},1500);
})();
