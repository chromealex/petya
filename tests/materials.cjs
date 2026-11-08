// Materials page data: grouping by app, sizes, made-up transcripts flagged, and deletion of a whole meeting.
const assert=require('node:assert/strict');
const feature=require('../src/features/materials.cjs');
const {ContextStore}=require('../src/context-store.cjs');
const now=Date.now();
const rows=[{id:'z1',source:'Встреча',sessionId:'m',title:'Встреча',text:'Обсудили релиз 19.3',at:now-3000},{id:'z2',source:'Встреча',sessionId:'m',title:'Встреча',text:'谢谢大家观看我们的节目',at:now-2000},
 {id:'s1',source:'Slack',title:'#dev',text:'Сборка упала',messages:[{at:now-1500,user:'U',text:'a'},{at:now-1000,user:'U',text:'b'}],at:now-1000},{id:'n1',source:'Заметка',title:'Итоги',text:'Вход по коду',at:now}];
const memory=new ContextStore({items:structuredClone(rows),save:()=>{},now:()=>now});
let removedSession='';
const ipc=feature.setup({memory,meetingSessions:{status:()=>[{id:'m',phase:'done'},{id:'gone',phase:'removed'}],remove:id=>removedSession=id,settings:()=>({mode:'auto'})}}).ipc;
const value=ipc.list();
assert.deepEqual(value.items.map(i=>i.app),['meetings','meetings','slack','notes']);
assert.equal(value.items[0].bytes,Buffer.byteLength('Обсудили релиз 19.3'));
assert.equal(value.items[0].suspect,'');assert.equal(value.items[1].suspect,'другой алфавит');
assert.equal(value.items[2].messages,2);assert.deepEqual(value.meetings.map(m=>m.id),['m']);assert.equal(value.recording.mode,'auto');
assert.equal(ipc.remove({sessionId:'m'}).removed,2);assert.equal(removedSession,'m');
assert.deepEqual(memory.prune().map(i=>i.id),['s1','n1']);
assert.equal(ipc.remove({ids:['n1']}).removed,1);assert.throws(()=>ipc.remove({ids:[1]}));
console.log('materials: groups, sizes, made-up transcripts and meeting deletion passed');
