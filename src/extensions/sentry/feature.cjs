// «Sentry»: the Sentry connection (address, token, organization, projects) and its crash source for «Крэши».
// Chat requests are answered by «Крэши»; this feature owns the settings, their validation, the settings card ipc
// and the one-time migration from the time Sentry settings belonged to «Крэши».
const kit=require('../app-kit.cjs');
const sentry=require('./client.cjs');
const ID='sentry';

function validate(next){
 next.sentryUrl=sentry.base(next.sentryUrl||sentry.DEFAULT_URL);
 const org=String(next.sentryOrg||'').trim();
 if(org&&!sentry.SLUG.test(org))throw Error('Slug организации Sentry: латиница, цифры, «-» и «_».');
 next.sentryOrg=org;
 const projects=String(next.sentryProjects||'').split(',').map(p=>p.trim()).filter(Boolean);
 if(projects.length>50||projects.some(p=>!sentry.SLUG.test(p)))throw Error('Проекты Sentry указаны неверно.');
 next.sentryProjects=[...new Set(projects)].join(',');
 if(String(next.sentryEnvironment||'').length>64||/[\s,]/.test(String(next.sentryEnvironment||'').trim()))throw Error('Окружение Sentry — одно имя без пробелов, например production.');
 if(String(next.sentryQuery||'').length>300)throw Error('Дополнительный фильтр Sentry слишком длинный.');
}

// Before «Sentry» became its own extension, its settings lived in «Крэши». Users who had «Крэши» added with a saved
// Sentry token get «Sentry» added once, so their crashes keep coming; an explicit decision about `extension_sentry`
// (the key present in the saved file) is kept. The settings keys did not change.
const pending=new WeakSet();
function migrate(settings,saved){
 if(!saved||'extension_sentry' in saved)return false;
 if(saved.extension_crashes!=='true'||!saved.sentryToken)return false;
 settings.extension_sentry='true';pending.add(settings);
 return true;
}

function setup(s){
 if(pending.has(s.settings)){pending.delete(s.settings);try{s.saveSettings?.({},true);}catch{/* saved with the next change */}}
 return {ipc:{
  status:()=>{let c={};try{c=sentry.config(s);}catch{}return {added:kit.installed(s,ID),hasToken:!!s.settings.sentryToken,url:c.url||sentry.DEFAULT_URL,org:c.org||'',projects:c.projects||[],environment:c.environment||''};},
  organizations:async()=>{if(!s.settings.sentryToken)throw Error('Сначала сохраните токен Sentry.');return sentry.organizations(s);},
  projects:async()=>{if(!sentry.connected(s))throw Error('Сначала сохраните токен и организацию Sentry.');return sentry.projects(s);}
 }};
}
module.exports={name:'sentry',defaults:{['extension_'+ID]:'false',sentryUrl:sentry.DEFAULT_URL,sentryOrg:'',sentryProjects:'',sentryEnvironment:'',sentryQuery:'',sentryToken:''},
 secrets:['sentryToken'],validate,migrate,setup};
