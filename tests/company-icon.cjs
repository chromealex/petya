// Company icon from Slack team.info: stored on the company, refreshed daily, kept when Slack lacks team:read.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Companies}=require('../src/companies.cjs');const {refreshCompanyIcon}=require('../src/company-icon.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-company-icon-'));
const nativeImage={createFromBuffer:b=>({isEmpty:()=>!b.length,resize:()=>({toDataURL:()=>'data:image/png;base64,'+b.toString('base64')})})};
(async()=>{try{
 const companies=new Companies(dir);let now=1000,team={ok:true,team:{name:'Azur',icon:{image_132:'https://avatars.slack-edge.com/2026/azur_132.png'}}},downloads=0,calls=[];
 const request=async(url,options)=>{calls.push([url,options.headers.Authorization]);return team;};
 const download=async url=>{downloads++;assert.match(url,/slack-edge\.com/);return new Uint8Array([1,2,3]);};
 const run=(extra={})=>refreshCompanyIcon({companies,companyId:'default',now:()=>now,settings:{slackToken:'xoxp-1'},request,download,nativeImage,...extra});
 assert.equal(await run(),true);
 assert.equal(companies.get('default').icon,'data:image/png;base64,AQID');assert.equal(companies.get('default').iconSource,'slack');
 assert.deepEqual(calls[0],['https://slack.com/api/team.info','Bearer xoxp-1']);
 // Within a day nothing is requested again; forced refresh goes through.
 now+=3600000;assert.equal(await run(),false);assert.equal(calls.length,1);
 // Missing team:read keeps the last good icon.
 team={ok:false,error:'missing_scope'};assert.equal(await run({force:true}),false);assert.equal(companies.get('default').icon,'data:image/png;base64,AQID');
 // OAuth credential: the token is added by the request layer, so the header carries no secret.
 team={ok:true,team:{name:'Azur',icon:{image_132:'https://avatars.slack-edge.com/x.png'}}};await run({force:true,settings:{slackCredential:'cred'}});assert.equal(calls.at(-1)[1],'Bearer ');
 // A default (generated) Slack icon or a foreign host gives no icon.
 team={ok:true,team:{name:'Azur',icon:{image_default:true,image_132:'https://a.slack-edge.com/default.png'}}};await run({force:true});assert.equal(companies.get('default').icon,undefined);
 team={ok:true,team:{name:'Azur',icon:{image_132:'https://evil.example/x.png'}}};const before=downloads;await run({force:true});assert.equal(downloads,before);
 // Slack disconnected: a Slack icon is removed.
 companies.setIcon('default',{icon:'data:image/png;base64,AQID',source:'slack',at:now});await run({force:true,settings:{}});assert.equal(companies.get('default').icon,undefined);
 assert.throws(()=>companies.setIcon('default',{icon:'javascript:alert(1)'}),/иконка/);
 // Survives a reload.
 companies.setIcon('default',{icon:'data:image/png;base64,AQID',source:'slack',at:now});assert.equal(new Companies(dir).get('default').icon,'data:image/png;base64,AQID');
 console.log('Company icon: Slack team.info, daily refresh, missing scope, default icon, host check, disconnect passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
