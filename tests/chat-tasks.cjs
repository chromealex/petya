const assert=require('node:assert/strict');const feature=require('../src/features/chat-tasks.cjs');
const topic={title:'ANR',messages:[{role:'user',text:'У нас ANR на старте'},{role:'assistant',text:'Похоже на синхронную загрузку'}]};const snapshots=new Map();let remembered=[];
const s={snapshots,dialogue:{active:()=>topic,rememberAction:(c,t)=>{remembered.push(t);topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}},highlights:{collect:()=>['ANR 2% на Android 14']}};
const {chatTasks,ipc}=feature.setup(s);
let r=chatTasks.turn('Создай задачу по этому обсуждению');assert(r.handled&&r.draftMaterial);assert.match(r.draftMaterial.text,/Важное[\s\S]*ANR 2%[\s\S]*Пользователь: У нас ANR на старте/);assert.equal(r.draftMaterial.title,'ANR 2% на Android 14');assert.match(remembered[0],/без подтверждения/);
r=chatTasks.turn('Создай задачу: починить ANR на старте');assert.equal(r.draftMaterial.title,'починить ANR на старте');assert.match(r.draftMaterial.text,/^починить ANR/);
for(const t of ['Создай задачу в BW','Покажи мои задачи','Создай задачу в Jira, нет, ничего не создавай'])assert.equal(chatTasks.turn(t),null,t);
const item=ipc.prepare('T','текст');assert.equal(snapshots.get(item.id).text,'текст');assert.throws(()=>ipc.prepare('T',' '),/Нет текста/);
console.log('Chat tasks: draft from the chat with marked facts first, explicit description, dictation untouched and context snapshot passed');
