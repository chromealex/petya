// Context of any size: chat history and requests are compacted, never silently cut.
const assert=require('node:assert/strict');
const compactor=require('../src/context-compactor.cjs');
const archive=require('../src/conversation-archive.cjs');
const {dialogueRequest}=require('../src/dialogue-request.cjs');
const feature=require('../src/features/context-compaction.cjs');
const size=body=>body.messages.reduce((n,m)=>n+compactor.tokens(m.content)+4,0);
const limit=body=>compactor.WINDOW-body.options.num_predict-300;
(async()=>{
 // A long pasted log no longer pushes everything before it out of the recent history.
 const log='Вот лог:\n'+'ERROR payment failed at Shop.cs:42\n'.repeat(500);
 const chat={id:'c1',messages:[{role:'user',text:'Меня зовут Аня, проект Север.',at:1},{role:'assistant',text:'Принято.',at:2},{role:'user',text:log,at:3},{role:'assistant',text:'Вижу ошибки оплаты.',at:4},{role:'user',text:'Как меня зовут?',at:5}]};
 const original=JSON.stringify(chat.messages);
 let c=archive.conversationContext(chat,'Как меня зовут?');
 assert(c.history.some(m=>m.text.includes('Аня')),'messages before a long one stay in the history');
 const short=c.history.find(m=>m.source===2);
 assert(short.compacted&&short.text.length<=1500&&/сжато/.test(short.text)&&short.text.includes('ERROR payment failed'),'the long message is compacted, head and tail kept');
 assert.equal(JSON.stringify(chat.messages),original,'originals are never changed');
 // When its model summary is ready, the summary replaces the excerpt.
 const a=archive.refreshArchive(chat);a.compacts[archive.messageHash(chat.messages[2])]='Пользователь прислал лог: 500 ошибок оплаты в Shop.cs:42.';
 c=archive.conversationContext(chat,'Как меня зовут?');
 assert(c.history.find(m=>m.source===2).text.includes('500 ошибок оплаты'));
 // Many long recent messages: every one keeps at least a short form.
 const many={id:'c2',messages:Array.from({length:18},(_,i)=>({role:i%2?'assistant':'user',text:'Сообщение '+i+': '+'подробности '.repeat(400),at:i}))};
 c=archive.conversationContext(many,'итог');
 assert.equal(c.history.length,18,'no recent message disappears');
 assert(c.history.reduce((n,m)=>n+m.text.length,0)<=8000+3000+18*20);
 // Archived blocks with summaries reach the model, including what Petya answered.
 const longChat={id:'c3',messages:[{role:'user',text:'Договорились: релиз Север 14 ноября.',at:0},{role:'assistant',text:'Записал: релиз 14 ноября, отвечает Борис.',at:1},...Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',text:'Реплика '+i,at:i+2}))]};
 const la=archive.refreshArchive(longChat);la.chunks[0].compact='Пользователь: релиз Север 14 ноября. Петя записал, что отвечает Борис.';
 c=archive.conversationContext(longChat,'Кто отвечает за релиз?');
 assert(c.archiveCompact?.some(x=>x.summary.includes('Борис')),'summaries of archived blocks keep both sides');
 assert.equal(archive.buildArchive(longChat).chunks[0].compact,la.chunks[0].compact,'a summary survives rebuilding the archive');
 longChat.messages[0].text='Договорились: релиз Север 20 ноября.';
 assert.equal(archive.buildArchive(longChat).chunks[0].compact,undefined,'an edited block loses its stale summary');
 // The whole request fits the window: big service data and history are compacted, the rules are intact.
 const issues=Array.from({length:400},(_,i)=>({key:'SEV-'+i,summary:'Задача про магазин и оплату номер '+i,status:'В работе'}));
 const busy={id:'c4',title:'Север',lastData:{project:'SEV',issues},messages:Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',text:'Обсуждение '+i+' '+'детали '.repeat(150),at:i}))};
 const body=dialogueRequest({model:'qwen3:8b',command:'Что с задачей SEV-399?',topic:busy,company:'Acme'});
 assert(size(body)<=limit(body),'the request fits the model window: '+size(body)+' > '+limit(body));
 assert(body.messages[0].content.startsWith('Ты Петя'),'the system rules are never compacted');
 assert(/сжато, чтобы поместиться в окно модели/.test(body.messages[1].content),'compaction of data is marked');
 assert.equal(body.messages.at(-1).content,'Что с задачей SEV-399?','the request itself stays whole');
 const small=dialogueRequest({model:'qwen3:8b',command:'Привет',topic:{id:'c5',messages:[]},company:'Acme'});
 assert(!/сжато/.test(JSON.stringify(small.messages)),'a small request is not touched');
 // A request larger than the window keeps its head and tail.
 const huge=dialogueRequest({model:'qwen3:8b',command:'Переведи: '+'очень длинный текст '.repeat(4000)+' КОНЕЦ',topic:{id:'c6',messages:[]},company:'Acme'});
 assert(size(huge)<=limit(huge)+50&&huge.messages.at(-1).content.startsWith('Переведи:')&&huge.messages.at(-1).content.endsWith('КОНЕЦ'));
 // Map-reduce compaction: pieces are summarised, joined and compacted again until they fit; cached.
 let calls=0;const request=async(url,o)=>{calls++;const b=JSON.parse(o.body),t=JSON.parse(b.messages[1].content).text;return {message:{content:JSON.stringify({summary:'Суть: '+t.slice(0,300)})}};};
 const book=Array.from({length:30},(_,i)=>'Глава '+i+'. '+'Событие главы '+i+' и важная цифра '+(i*7)+'. '.repeat(80)).join('\n\n');
 const cache=new compactor.Cache();
 const out=await compactor.compact({text:book,purpose:'text',question:'цифры',target:1200,request,endpoint:'http://127.0.0.1:11434/api/chat',model:'m',cache});
 assert(compactor.tokens(out)<=1200,'map-reduce reaches the target');
 const first=calls;await compactor.compact({text:book,purpose:'text',question:'цифры',target:1200,request,endpoint:'http://127.0.0.1:11434/api/chat',model:'m',cache});
 assert.equal(calls,first,'compaction of the same text is cached');
 await assert.rejects(compactor.compact({text:book,target:500,request:async()=>{throw Error('down');},endpoint:'x',model:'m',strict:true,cache:new compactor.Cache()}),/down/,'strict compaction reports failures');
 const fallback=await compactor.compact({text:book,target:500,request:async()=>{throw Error('down');},endpoint:'x',model:'m',cache:new compactor.Cache()});
 assert(/сжато/.test(fallback),'without the model the text is excerpted, not lost');
 // Files: line numbers of the original survive compaction.
 const pieces=compactor.lineChunks('a\nb\n'+'x\n'.repeat(5000)+'ERROR here',800);
 assert.equal(pieces[0].text.split('\n')[0],'1: a');assert(pieces.at(-1).text.endsWith('5003: ERROR here'));
 // The background feature compacts archived blocks and long messages when the model is idle.
 const topic={id:'bg',messages:[{role:'user',text:'Бюджет Юг 2400 рублей.',at:0},{role:'assistant',text:'Принято.',at:1},...Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',text:'Реплика '+i,at:i+2})),{role:'user',text:'Отчёт: '+'строка отчёта '.repeat(600),at:99}]};
 let persisted=0;const dialogue={state:{topics:[topic]},persist(){persisted++;archive.refreshArchive(topic);}};
 const asked=[];
 const s={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},core:require('../src/core.cjs'),dialogue,chatJobs:{jobs:new Map()},
  request:async(url,o)=>{const b=JSON.parse(o.body);asked.push(b);return {message:{content:JSON.stringify({summary:'Сводка: бюджет Юг 2400, отчёт прислан.'})}};}};
 const {contextCompaction}=feature.setup(s);
 assert.equal(await contextCompaction.step('bg'),true);
 assert(topic.conversationArchive.chunks[0].compact,'the first archived block got a summary');
 while(await contextCompaction.step('bg'));
 assert(topic.conversationArchive.chunks.filter(c=>c.to-c.from===12).every(c=>c.compact),'every full archived block is compacted');
 assert(topic.conversationArchive.chunks.filter(c=>c.to-c.from<12).every(c=>!c.compact),'the growing last block waits until it is full');
 assert(topic.conversationArchive.compacts[archive.messageHash(topic.messages.at(-1))],'the long recent message is compacted');
 assert(persisted>=2);
 assert(asked.every(b=>/Пользователь|Петя/.test(b.messages[0].content)),'chat compaction keeps who said what');
 // A failed model call stores nothing; the block is retried later.
 const t2={id:'bg2',messages:[...Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',text:'Длинная реплика '+i+' '+'слово '.repeat(120),at:i}))]};
 const s2={...s,dialogue:{state:{topics:[t2]},persist(){}},request:async()=>{throw Error('Ollama не отвечает');}};
 await assert.rejects(feature.setup(s2).contextCompaction.step('bg2'));
 assert(!archive.buildArchive(t2).chunks.some(c=>c.compact),'no summary is invented on failure');
 // Disabled in settings: nothing is queued.
 const s3={...s,settings:{...s.settings,contextCompaction:'false'}};const off=feature.setup(s3).contextCompaction;off.schedule(topic);assert.equal(off.queue.size,0);
 console.log('Context compaction: long messages kept, short forms, block summaries with both sides, window fit, oversized requests, map-reduce with cache, strict failures, line numbers and background worker OK');
})().catch(e=>{console.error(e);process.exit(1);});
