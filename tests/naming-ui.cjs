// «Нейминг» card in the real chat: candidates free first with verdict chips, length bars, check dots, meaning and
// notes, copy per name, follow-up actions; names and meanings are text, not HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const free={status:'free',matches:[]};
 const row=(name,meaning,extra={})=>({name,meaning,lang:/[a-z]/i.test(name)?'en':'ru',length:[...name].length,words:name.split(' ').length,script:/[a-z]/i.test(name)?'latin':'cyrillic',translit:'',notes:[],warnings:[],project:free,appStore:{...free,country:'RU'},googlePlay:free,verdict:{status:'free'},...extra});
 const event0={mode:'make',request:'придумай название для ивента на Хэллоуин',kind:'event',limit:0,lang:'',avoid:[],
  checked:{project:true,roots:1,locFiles:3,codeFiles:412,appStore:true,googlePlay:false,googlePlayNote:'Google Play не проверен: включите «Поиск в интернете» в «Подключениях».',domain:false},
  candidates:[
   row('Ночь фонарей','Фонари из тыкв освещают карту — короткий ночной ивент.',{translit:'Noch fonarey'}),
   row('Тыквенный переполох','Хаос на ферме тыкв: собирай тыквы, пока их не утащили.',{translit:'Tykvennyy perepolokh',notes:['для англоязычных трудны: ы, х (латиницей — Tykvennyy perepolokh)']}),
   row('Pumpkin Rush','Гонка за тыквами; звучит динамично на английском.',{translit:'Пумпкин Руш',notes:['по-русски: u читается неоднозначно']}),
   row('Bunkerfall <img src=x onerror=alert(1)>','x',{verdict:{status:'similar',where:'App Store',like:'Bunker Falls'},appStore:{status:'similar',matches:[{kind:'similar',name:'Bunker Falls',seller:'X',url:'https://apps.apple.com/app/id2'}]}}),
   row('Тыквенная ночь','Прямо и понятно, но уже есть в проекте.',{verdict:{status:'taken',where:'проекте',like:'Тыквенная ночь'},project:{status:'taken',matches:[{kind:'exact',text:'Тыквенная ночь',where:'Localization.csv · event_pumpkin_night'}]},notes:['для англоязычных трудны: ы (латиницей — Tykvennaya noch)']}),
   row('Gnоmgard','смешанные буквы',{script:'mixed',warnings:['смешаны кириллица и латиница — в поиске и сторах это разные буквы']}),
   row('Вечер тыквенных фонарей и страшилок','слишком длинно',{warnings:['длиннее 20 символов']})]};
 // Google Play was not checked for this card (web search off).
 const event={...event0,candidates:event0.candidates.map(c=>({...c,googlePlay:null}))};
 const game={mode:'check',request:'проверь название «Bunker Wars»',kind:'game',limit:0,
  checked:{project:true,roots:1,locFiles:3,codeFiles:412,appStore:true,googlePlay:true,googlePlayNote:'',domain:true},
  candidates:[row('Bunker Wars','',{length:11,words:2,verdict:{status:'taken',where:'App Store',like:'Bunker Wars: WW1 RTS'},appStore:{status:'taken',matches:[{kind:'exact',name:'Bunker Wars: WW1 RTS',seller:'Hexapod'}]},googlePlay:{status:'taken',matches:[{kind:'exact',name:'Bunker Wars'}]},domain:{domain:'bunkerwars.com',status:'taken'},translit:'Бункер Уарс',notes:['по-русски: w прочтут как «в» или «у»']})]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'придумай название для ивента на Хэллоуин'},{role:'assistant',text:'7 вариантов.',by:'Нейминг',extensionData:{namingCard:${JSON.stringify(event)}}},{role:'user',text:'проверь название «Bunker Wars»'},{role:'assistant',text:'Занято.',by:'Нейминг',extensionData:{namingCard:${JSON.stringify(game)}}}],'Нейминг')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.naming-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.naming-card').length"),2);
 const first="document.querySelectorAll('.naming-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.naming-row').length"),6,'six shown, the rest behind «Показать ещё»');
 assert.equal(await js("document.querySelectorAll('.naming-card img').length"),0,'names are text, not HTML');
 assert.equal(await js(first+".querySelector('.naming-row.is-taken .kit-chip').textContent"),'занято: «Тыквенная ночь»');
 assert.equal(await js(first+".querySelector('.naming-row.is-similar .kit-chip').textContent"),'похоже на «Bunker Falls»');
 assert.equal(await js(first+".querySelectorAll('.naming-row')[0].querySelectorAll('.naming-dot').length"),3,'no domain dot until checked');
 assert.deepEqual(await js("[..."+first+".querySelectorAll('.kit-actions button')].map(b=>b.textContent)"),['Ещё в этом стиле','Короче','Проверить домены .com','Скопировать все']);
 assert.deepEqual(await js("[...document.querySelectorAll('.naming-card')[1].querySelectorAll('.kit-actions button')].map(b=>b.textContent)"),[],'a check of one name: no follow-ups, domains already checked, nothing more to copy');
 assert.equal(await js("document.querySelectorAll('.naming-card')[1].querySelectorAll('.naming-dot').length"),4);
 await js(first+".querySelector('.naming-more').click()");
 assert.equal(await js(first+".querySelectorAll('.naming-row').length"),7);
 assert.equal(await js(first+".querySelector('.naming-bar.over')!==null"),true,'a name over the limit is marked');
 await require('./card-shot.cjs')(win,'.naming-card[data-mode="check"]','petya-naming-check');
 await require('./card-shot.cjs')(win,'.naming-card[data-mode="make"]','petya-naming');
 console.log('Naming card: free first, verdict chips, length bars, check dots, safe text, follow-up actions passed');
}};
require('../src/main.cjs');
