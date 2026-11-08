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

// Fallbacks: the Slack window (same workspace only, screen recording already allowed), then Jira.
const {findWorkspaceIcon,slackWindowIcon}=require('../src/company-icon.cjs');
(async()=>{const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'petya-company-icon-2-'));try{
 const W=400,H=300,bitmap=Buffer.alloc(W*H*4);
 const fill=(x0,y0,w,h,[r,g,b],round=false)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){if(round&&Math.hypot(x-x0-w/2+.5,y-y0-h/2+.5)>w/2)continue;const i=(y*W+x)*4;bitmap[i]=b;bitmap[i+1]=g;bitmap[i+2]=r;bitmap[i+3]=255;}};
 fill(0,0,W,H,[63,14,64]);fill(60,0,W-60,H,[255,255,255]);            // aubergine rail, white content
 for(const x of [8,24,40])fill(x,8,10,10,[255,95,87],true);             // traffic lights (too small)
 fill(14,40,36,36,[30,160,90]);fill(20,50,8,8,[255,255,255]);           // workspace icon with a glyph
 fill(16,110,32,6,[200,200,200]);                                        // a «Home» label (not square)
 fill(14,150,30,30,[220,180,40]);                                        // a lower rail button
 assert.deepEqual(findWorkspaceIcon(bitmap,W,H),{x:14,y:40,width:36,height:36});
 let cropped=null;
 const thumbnail={isEmpty:()=>false,getSize:()=>({width:W,height:H}),toBitmap:()=>bitmap,crop:rect=>{cropped=rect;return {resize:()=>({toDataURL:()=>'data:image/png;base64,V0lO'})};}};
 const sources=[{name:'general (Channel) - Other Team - Slack',thumbnail},{name:'general (Channel) - Azur - Slack',thumbnail}];
 const getSources=async()=>sources;
 assert.deepEqual(await slackWindowIcon({team:'Azur',getSources,screenAllowed:()=>true,nativeImage}),{icon:'data:image/png;base64,V0lO'});assert.equal(cropped.y,40);
 assert.equal((await slackWindowIcon({team:'Azur',getSources,screenAllowed:()=>false,nativeImage})).error,'no_window','never asks for screen recording');
 assert.equal((await slackWindowIcon({team:'Missing',getSources,screenAllowed:()=>true,nativeImage})).error,'no_window','another workspace window is not used');
 // End to end: no team:read → window icon; no window → Jira project avatar.
 const companies=new Companies(dir2);let now=1;
 const slackNoScope=async url=>/team\.info/.test(url)?{ok:false,error:'missing_scope'}:/auth\.test/.test(url)?{ok:true,team:'Azur'}:/rest\/api\/3\/project\/MOB/.test(url)?{avatarUrls:{'48x48':'https://acme.atlassian.net/rest/api/3/universal_avatar/view/type/project/avatar/10500'}}:null;
 const jiraSettings={slackToken:'xoxp',module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'a@b.c',jiraToken:'t',jiraProject:'MOB'};
 let downloaded=[];const download=async(url,options)=>{downloaded.push([url,options?.headers?.Authorization]);return new Uint8Array([9]);};
 await refreshCompanyIcon({companies,companyId:'default',now:()=>now,force:true,settings:jiraSettings,request:slackNoScope,download,nativeImage,getSources,screenAllowed:()=>true});
 assert.equal(companies.get('default').iconSource,'slack-window');assert.equal(downloaded.length,0);
 await refreshCompanyIcon({companies,companyId:'default',now:()=>now,force:true,settings:jiraSettings,request:slackNoScope,download,nativeImage,getSources:async()=>[],screenAllowed:()=>true});
 assert.equal(companies.get('default').iconSource,'jira');assert.equal(companies.get('default').icon,'data:image/png;base64,CQ==');
 assert.match(downloaded[0][0],/acme\.atlassian\.net/);assert.match(downloaded[0][1],/^Basic /);
 // OAuth Jira: the site avatar from accessible-resources.
 downloaded=[];
 const oauthRequest=async url=>/team\.info/.test(url)?{ok:false,error:'missing_scope'}:/auth\.test/.test(url)?{ok:false}:/accessible-resources/.test(url)?[{id:'site1',url:'https://acme.atlassian.net',avatarUrl:'https://site-admin-avatar-cdn.prod.public.atl-paas.net/avatars/240/rocket.png'}]:null;
 await refreshCompanyIcon({companies,companyId:'default',now:()=>now,force:true,settings:{slackToken:'x',module_jira:'true',jiraUrl:'https://acme.atlassian.net',atlassianCredential:'cred'},request:oauthRequest,download,nativeImage,atlassianToken:async()=>({accessToken:'at',site:{id:'site1'}})});
 assert.equal(companies.get('default').iconSource,'jira');assert.match(downloaded[0][0],/atl-paas\.net/);assert.equal(downloaded[0][1],undefined,'public avatar: no credentials sent');
 console.log('Company icon fallbacks: Slack window rail detection, same-workspace check, no permission prompt, Jira project and site avatars passed');
}finally{fs.rmSync(dir2,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
