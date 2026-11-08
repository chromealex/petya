const assert=require('node:assert/strict');
const {createTrayMenu}=require('../src/tray-menu.cjs');
let destination='',toggles=0,stops=0;
const options={Menu:{buildFromTemplate:items=>items},platform:'win32',company:'Рабочая',ready:true,show(){},navigate:page=>destination=page,toggle:()=>toggles++,pause:()=>stops++,quit(){}};
let menu=createTrayMenu({...options,listening:false});
assert.equal(menu[0].label,'Петя · Рабочая');
menu.find(item=>item.label==='Включить микрофон').click();assert.equal(toggles,1);
menu.find(item=>item.label==='Остановить всё прослушивание').click();assert.equal(stops,1);
for(const [label,page] of [['Материалы','sources'],['Команда','team'],['История','history'],['Подключения…','settings']]){
 menu.find(item=>item.label===label).click();assert.equal(destination,page);
}
menu=createTrayMenu({...options,listening:true});
assert.ok(menu.some(item=>item.label==='Выключить микрофон'));
menu=createTrayMenu({...options,ready:false});
assert.equal(menu.find(item=>item.label==='Включить микрофон').enabled,false);
let opened='';menu=createTrayMenu({...options,listening:false,dashboards:[{id:'d1',title:'Релиз'}],openDashboard:id=>opened=id});
menu.find(item=>item.label==='Дашборды').submenu[0].click();assert.equal(opened,'d1');
assert(!createTrayMenu({...options,listening:false}).some(item=>item.label==='Дашборды'),'no dashboards — no submenu');
console.log('Tray menu tests passed');
