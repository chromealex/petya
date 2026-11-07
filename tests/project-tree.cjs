// Subprojects inherit folders, context, disabled services and the work-project link; own values stay editable.
const assert=require('node:assert/strict');
const tree=require('../src/project-tree.cjs');
const {Dialogue}=require('../src/dialogue.cjs');

const projects=[{id:'general',name:'Общее'},{id:'app',name:'Приложение',folders:['/repo/app'],folder:'/repo/app',context:'Игра на Unity.',disabledServices:['asana'],memoryId:'mem-app'},{id:'ui',name:'Интерфейс'}];
tree.setParent(projects,projects[2],'app');
tree.assignOwn(projects[2],{folders:['/repo/ui-kit'],context:'Только экраны меню.',disabledServices:['telegram']});
tree.materialize(projects);
const ui=projects[2];
assert.deepEqual(ui.folders,['/repo/ui-kit','/repo/app'],'own folders first, then inherited');
assert.equal(ui.folder,'/repo/ui-kit');
assert.equal(ui.context,'Игра на Unity.\n\nТолько экраны меню.');
assert.deepEqual(ui.disabledServices.sort(),['asana','telegram']);
assert.equal(ui.memoryId,'mem-app','work-project link is inherited');
assert.deepEqual(tree.own(ui),{folders:['/repo/ui-kit'],context:'Только экраны меню.',disabledServices:['telegram'],memoryId:''});
assert.equal(tree.path(projects,ui),'Приложение / Интерфейс');

// Parent edits flow down.
projects[1].context='Игра на Unity 6.';tree.materialize(projects);
assert.equal(ui.context,'Игра на Unity 6.\n\nТолько экраны меню.');

// Invalid parents are rejected.
assert.throws(()=>tree.assertParent(projects,'app','ui'),/сам в себя/);
assert.throws(()=>tree.assertParent(projects,'ui','general'),/Общее/);
assert.throws(()=>tree.assertParent(projects,'app','app'),/сам в себя/);
projects.push({id:'deep',name:'Кнопки'});tree.setParent(projects,projects[3],'ui');tree.materialize(projects);
projects.push({id:'deeper',name:'Иконки'});
assert.throws(()=>tree.assertParent(projects,'deeper','deep'),/уровней/);
assert.throws(()=>tree.assertParent(projects,'','deep'),/уровней/,'a new project cannot go below the depth limit');

// Back to the top level: own values become plain values again.
tree.setParent(projects,projects[3],'');tree.setParent(projects,ui,'');tree.materialize(projects);
assert.deepEqual(ui.folders,['/repo/ui-kit']);assert.equal(ui.context,'Только экраны меню.');assert.equal(ui.memoryId,'');assert.equal(ui.parentId,undefined);assert.equal(ui.ownFolders,undefined);

// Broken links (missing parent, cycles) are dropped on load.
const broken=[{id:'general',name:'Общее'},{id:'a',name:'A',parentId:'missing',ownFolders:['/a']},{id:'b',name:'B',parentId:'c',ownFolders:[]},{id:'c',name:'C',parentId:'b',ownFolders:[]}];
tree.materialize(broken);
assert.equal(broken[1].parentId,undefined);assert.deepEqual(broken[1].folders,['/a']);
assert.ok(!(broken[2].parentId&&broken[3].parentId),'cycle is broken');

// Dialogue: archiving a parent archives its subprojects; restoring a subproject restores its parents.
const dialogue=new Dialogue({state:{topics:[],activeId:'',projects:[{id:'general',name:'Общее'},{id:'p',name:'P',context:'parent'},{id:'c',name:'C',parentId:'p',ownContext:'child'}]}});
assert.equal(dialogue.state.projects.find(p=>p.id==='c').context,'parent\n\nchild','materialized on load');
dialogue.archive('project','p',true);
assert.equal(dialogue.state.projects.find(p=>p.id==='c').archived,true);
dialogue.archive('project','c',false);
assert.equal(dialogue.state.projects.find(p=>p.id==='p').archived,false);
console.log('Project tree: inheritance, own values, depth, cycles and archive cascade passed');
