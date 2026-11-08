// A fake Grafana HTTP API on 127.0.0.1 for the «Grafana» tests: /api/health, /api/search (dashboards and folders),
// /api/dashboards/uid/<uid> (a «Leagues» dashboard with templating, rows incl. a collapsed one, a library panel, a
// mixed-datasource panel, unsupported panels; a «Retention & Revenue» dashboard for the metrics mapping),
// /api/library-elements/<uid>, /api/frontend/settings and POST /api/ds/query returning data frames for time series,
// stat, bar gauge and table panels. Bearer token «glsa_test» is accepted; «glsa_viewer_noaccess» gets 403 on
// dashboards; anything else 401. A query whose expr contains «slow» never answers (timeouts). Every request is logged.
const http=require('node:http');
const DAY=86400000;
const TOKEN='glsa_test';
const UID='c9e4b7f6-9caf-428d-a93f-578ec4be556f';
const prom={type:'prometheus',uid:'prom-main'},pg={type:'grafana-postgresql-datasource',uid:'pg-game'};

const leagues={
 uid:UID,title:'Leagues',tags:['game','leagues'],time:{from:'now-24h',to:'now'},timezone:'browser',schemaVersion:39,
 templating:{list:[
  {name:'ds',type:'datasource',query:'prometheus',current:{text:'Prometheus',value:'prom-main'},hide:2},
  {name:'server',label:'Сервер',type:'query',datasource:prom,current:{text:'eu',value:'eu'},options:[{text:'eu',value:'eu'},{text:'us',value:'us'},{text:'asia',value:'asia'}]},
  {name:'league',label:'Лига',type:'custom',multi:true,includeAll:true,query:'gold,silver,bronze',current:{text:['All'],value:['$__all']},options:[{text:'All',value:'$__all'},{text:'gold',value:'gold'},{text:'silver',value:'silver'},{text:'bronze',value:'bronze'}]},
  {name:'env',type:'constant',query:'prod',hide:2}
 ]},
 panels:[
  {type:'row',title:'Overview',id:100,collapsed:false,gridPos:{x:0,y:0,w:24,h:1},panels:[]},
  {id:1,type:'stat',title:'Active leagues',gridPos:{x:0,y:1,w:6,h:4},datasource:{type:'prometheus',uid:'${ds}'},
   targets:[{refId:'A',datasource:{type:'prometheus',uid:'${ds}'},expr:'count(league_active{server="$server",env="$env"})'}],
   fieldConfig:{defaults:{unit:'none',decimals:0,thresholds:{mode:'absolute',steps:[{color:'green',value:null},{color:'orange',value:100},{color:'red',value:200}]}},overrides:[]},options:{reduceOptions:{calcs:['lastNotNull'],values:false},graphMode:'none'}},
  {id:2,type:'stat',title:'Players online',gridPos:{x:6,y:1,w:6,h:4},datasource:prom,
   targets:[{refId:'A',datasource:prom,expr:'sum(players_online{server="$server"})'}],
   fieldConfig:{defaults:{unit:'short',thresholds:{mode:'absolute',steps:[{color:'red',value:null},{color:'green',value:1000}]}},overrides:[]},options:{reduceOptions:{calcs:['lastNotNull']},graphMode:'area'}},
  {id:3,type:'gauge',title:'Match fill rate',gridPos:{x:12,y:1,w:6,h:4},datasource:prom,
   targets:[{refId:'A',datasource:prom,expr:'avg(match_fill_ratio{server="$server"}) * 100'}],
   fieldConfig:{defaults:{unit:'percent',min:0,max:100,decimals:1,thresholds:{mode:'absolute',steps:[{color:'red',value:null},{color:'#EAB839',value:60},{color:'green',value:80}]}},overrides:[]},options:{reduceOptions:{calcs:['mean']}}},
  {id:4,type:'timeseries',title:'Players by league',gridPos:{x:0,y:5,w:12,h:8},datasource:prom,interval:'1m',
   targets:[{refId:'A',datasource:prom,expr:'sum by (league) (league_players{league=~"$league",server="$server"})',legendFormat:'{{league}}'}],
   fieldConfig:{defaults:{unit:'short',custom:{drawStyle:'line'}},overrides:[{matcher:{id:'byName',options:'gold'},properties:[{id:'color',value:{mode:'fixed',fixedColor:'yellow'}}]}]}},
  {id:5,type:'bargauge',title:'Matches by league',gridPos:{x:12,y:5,w:12,h:8},datasource:{type:'datasource',uid:'-- Mixed --'},
   targets:[{refId:'A',datasource:prom,expr:'sum by (league) (increase(matches_total{league=~"$league"}[$__range]))',legendFormat:'{{league}}'},
    {refId:'B',datasource:pg,rawSql:"SELECT now() AS time, count(*) AS \"tournaments\" FROM tournaments WHERE league IN ($league)",format:'time_series'}],
   fieldConfig:{defaults:{unit:'short',min:0,thresholds:{mode:'percentage',steps:[{color:'blue',value:null},{color:'purple',value:70}]}},overrides:[]},options:{reduceOptions:{calcs:['sum']},orientation:'horizontal'}},
  {type:'row',title:'Economy',id:101,collapsed:true,gridPos:{x:0,y:13,w:24,h:1},panels:[
   {id:6,type:'table',title:'League standings',gridPos:{x:0,y:14,w:12,h:8},datasource:pg,
    targets:[{refId:'A',datasource:pg,format:'table',rawSql:"SELECT league AS \"League\", players AS \"Players\", revenue AS \"Revenue\", win_rate AS \"Win rate\" FROM standings WHERE league IN ($league) AND server = '$server'"}],
    fieldConfig:{defaults:{},overrides:[{matcher:{id:'byName',options:'Revenue'},properties:[{id:'unit',value:'currencyUSD'},{id:'decimals',value:0}]},{matcher:{id:'byName',options:'Win rate'},properties:[{id:'unit',value:'percentunit'},{id:'decimals',value:1}]}]},
    options:{sortBy:[{displayName:'Players',desc:true}]}},
   {id:7,gridPos:{x:12,y:14,w:12,h:8},libraryPanel:{uid:'lib-revenue',name:'Revenue'}}
  ]},
  {id:8,type:'text',title:'Notes',gridPos:{x:0,y:22,w:12,h:4},options:{content:'<b>See runbook</b>',mode:'html'}},
  {id:9,type:'heatmap',title:'Match duration',gridPos:{x:12,y:22,w:12,h:4},datasource:prom,targets:[{refId:'A',datasource:prom,expr:'sum(rate(match_duration_bucket[5m])) by (le)'}]}
 ]
};
const library={uid:'lib-revenue',name:'Revenue',model:{type:'timeseries',title:'Revenue',datasource:pg,
 targets:[{refId:'A',datasource:pg,format:'time_series',rawSql:"SELECT $__timeGroupAlias(ts,1h), sum(amount) AS value FROM payments WHERE $__timeFilter(ts) AND server='$server' GROUP BY 1"}],
 fieldConfig:{defaults:{unit:'currencyUSD',decimals:0},overrides:[]}}};

const retention={uid:'ret-main',title:'Retention & Revenue',tags:['kpi'],time:{from:'now-30d',to:'now'},templating:{list:[
  {name:'platform',type:'custom',query:'all,android,ios',current:{text:'all',value:'all'},options:[{text:'all',value:'all'},{text:'android',value:'android'},{text:'ios',value:'ios'}]}]},
 panels:[
  {id:11,type:'timeseries',title:'Daily active users',gridPos:{x:0,y:0,w:12,h:8},datasource:prom,targets:[{refId:'A',datasource:prom,expr:'sum(game_dau{platform=~"$platform"})',legendFormat:'DAU'}],fieldConfig:{defaults:{unit:'short'},overrides:[]}},
  {id:12,type:'timeseries',title:'New users',gridPos:{x:12,y:0,w:12,h:8},datasource:prom,targets:[{refId:'A',datasource:prom,expr:'sum(game_installs{platform=~"$platform"})'}],fieldConfig:{defaults:{unit:'short'},overrides:[]}},
  {id:13,type:'timeseries',title:'Gross revenue',gridPos:{x:0,y:8,w:12,h:8},datasource:pg,targets:[{refId:'A',datasource:pg,format:'time_series',rawSql:'SELECT $__timeGroupAlias(ts,1d), sum(amount) AS revenue FROM payments WHERE $__timeFilter(ts) GROUP BY 1'}],fieldConfig:{defaults:{unit:'currencyUSD'},overrides:[]}},
  {id:14,type:'timeseries',title:'Retention',gridPos:{x:12,y:8,w:12,h:8},datasource:prom,targets:['1','7','30'].map((d,i)=>({refId:String.fromCharCode(65+i),datasource:prom,expr:'game_retention{day="'+d+'",platform=~"$platform"} * 100',legendFormat:'D'+d})),fieldConfig:{defaults:{unit:'percent'},overrides:[]}},
  {id:15,type:'stat',title:'ARPDAU',gridPos:{x:0,y:16,w:6,h:4},datasource:pg,targets:[{refId:'A',datasource:pg,rawSql:'SELECT sum(amount)/count(distinct user_id) FROM payments'}],fieldConfig:{defaults:{unit:'currencyUSD',decimals:3},overrides:[]}},
  {id:16,type:'stat',title:'Server CPU',gridPos:{x:6,y:16,w:6,h:4},datasource:prom,targets:[{refId:'A',datasource:prom,expr:'avg(cpu_usage)'}],fieldConfig:{defaults:{unit:'percent'},overrides:[]}}
 ]};
const others=[
 {uid:'srv-health',title:'Server health',folderTitle:'Infra',folderUid:'f-infra',tags:['infra']},
 {uid:'mm-queue',title:'Matchmaking queue',folderTitle:'Infra',folderUid:'f-infra',tags:['matchmaking']}
];
const DASHBOARDS={[UID]:{dashboard:leagues,folder:'Game',folderUid:'f-game',slug:'leagues'},'ret-main':{dashboard:retention,folder:'Game',folderUid:'f-game',slug:'retention-and-revenue'}};

// Deterministic data. t in ms; the day index drives the daily metrics.
const day=t=>Math.floor(t/DAY);
const wave=(t,period,amp)=>amp*Math.sin(2*Math.PI*(t%period)/period);
function series(expr,t){
 if(/count\(league_active/.test(expr))return 128;
 if(/players_online/.test(expr))return 4300+Math.round(wave(t,DAY,900));
 if(/match_fill_ratio/.test(expr))return 72.5+wave(t,6*3600000,6);
 if(/game_dau/.test(expr))return 12000+(new Date(t).getUTCDay()%6===0?2400:0)+20*(day(t)%50);
 if(/game_installs/.test(expr))return 1300+(new Date(t).getUTCDay()===6?300:0);
 if(/game_retention\{day="1"/.test(expr))return 41;
 if(/game_retention\{day="7"/.test(expr))return 16;
 if(/game_retention\{day="30"/.test(expr))return 6.5;
 return 0;
}
const LEAGUES={gold:{players:900,matches:5200,revenue:15400,win:0.54},silver:{players:2100,matches:9800,revenue:8800,win:0.5},bronze:{players:3400,matches:12100,revenue:2900,win:0.47}};
function picked(text){const m=text.match(/league=~"([^"]*)"/)||text.match(/IN \(([^)]*)\)/);if(!m)return Object.keys(LEAGUES);return Object.keys(LEAGUES).filter(k=>new RegExp('(^|[^a-z])'+k+'([^a-z]|$)').test(m[1]));}
function times(from,to,step){const out=[];const s=Math.max(step,1000);for(let t=Math.ceil(from/s)*s;t<=to&&out.length<5000;t+=s)out.push(t);return out;}

function frames(q,from,to){
 const step=Number(q.intervalMs)||60000;
 const text=String(q.expr||q.rawSql||'');
 const ts=times(from,to,step);
 const tf={name:'Time',type:'time',typeInfo:{frame:'time.Time'},config:{interval:step}};
 if(/league_players/.test(text))return picked(text).map(l=>({schema:{refId:q.refId,meta:{type:'timeseries-multi'},fields:[tf,{name:'Value',type:'number',labels:{league:l},config:{displayNameFromDS:l}}]},data:{values:[ts,ts.map(t=>Math.round(LEAGUES[l].players+wave(t,DAY,LEAGUES[l].players*0.25)))]}}));
 if(/matches_total/.test(text))return picked(text).map(l=>({schema:{refId:q.refId,fields:[{...tf},{name:'Value',type:'number',labels:{league:l},config:{displayNameFromDS:l}}]},data:{values:[[to],[LEAGUES[l].matches]]}}));
 if(/FROM tournaments/.test(text))return [{schema:{refId:q.refId,fields:[tf,{name:'tournaments',type:'number',config:{}}]},data:{values:[[to],[picked(text).length*14]]}}];
 if(/FROM standings/.test(text)){const ls=picked(text);return [{schema:{refId:q.refId,meta:{executedQueryString:text},fields:[{name:'League',type:'string',config:{}},{name:'Players',type:'number',config:{}},{name:'Revenue',type:'number',config:{}},{name:'Win rate',type:'number',config:{}}]},data:{values:[ls,ls.map(l=>LEAGUES[l].players),ls.map(l=>LEAGUES[l].revenue),ls.map(l=>LEAGUES[l].win)]}}];}
 if(/FROM payments WHERE \$__timeFilter\(ts\) AND server/.test(text))return [{schema:{refId:q.refId,fields:[tf,{name:'value',type:'number',config:{}}]},data:{values:[ts,ts.map(t=>Math.round(1100+wave(t,DAY,350)))]}}];
 if(/sum\(amount\) AS revenue/.test(text))return [{schema:{refId:q.refId,fields:[tf,{name:'revenue',type:'number',config:{}}]},data:{values:[ts,ts.map(t=>610+(new Date(t).getUTCDay()===6?140:0))]}}];
 if(/count\(distinct user_id\)/.test(text))return [{schema:{refId:q.refId,fields:[{name:'arpdau',type:'number',config:{}}]},data:{values:[[0.051]]}}];
 const fields=[tf,{name:'Value',type:'number',config:q.legendFormat&&!/\{\{/.test(q.legendFormat)?{displayNameFromDS:q.legendFormat}:{}}];
 return [{schema:{refId:q.refId,fields},data:{values:[ts,ts.map(t=>series(text,t))]}}];
}

function start({token=TOKEN}={}){
 const calls=[];
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',c=>{body+=c;});
  req.on('end',()=>{
   const u=new URL(req.url,'http://x');calls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),auth:req.headers.authorization||'',body:body?JSON.parse(body):null});
   const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
   // Served under /grafana to check the path prefix; anything else is Grafana's redirect to the login page.
   if(!u.pathname.startsWith('/grafana/')){res.writeHead(302,{Location:'/grafana/login'});res.end();return;}
   const path=u.pathname.slice('/grafana'.length);
   if(path==='/api/health')return send(200,{commit:'abc',database:'ok',version:'11.3.0'});
   const auth=req.headers.authorization||'';
   if(auth!=='Bearer '+token&&auth!=='Bearer glsa_viewer_noaccess')return send(401,{message:'invalid API key'});
   if(path==='/api/search'){
    if(u.searchParams.get('type')==='dash-folder')return send(200,[{uid:'f-game',title:'Game',type:'dash-folder'},{uid:'f-infra',title:'Infra',type:'dash-folder'}]);
    const all=[...Object.values(DASHBOARDS).map(d=>({uid:d.dashboard.uid,title:d.dashboard.title,url:'/grafana/d/'+d.dashboard.uid+'/'+d.slug,type:'dash-db',tags:d.dashboard.tags,folderTitle:d.folder,folderUid:d.folderUid})),
     ...others.map(o=>({...o,url:'/grafana/d/'+o.uid+'/'+o.title.toLowerCase().replace(/\W+/g,'-'),type:'dash-db'}))];
    const q=(u.searchParams.get('query')||'').toLowerCase();
    return send(200,all.filter(d=>!q||d.title.toLowerCase().includes(q)).slice(0,Number(u.searchParams.get('limit'))||1000));
   }
   let m=path.match(/^\/api\/dashboards\/uid\/([\w-]+)$/);
   if(m){if(auth==='Bearer glsa_viewer_noaccess')return send(403,{message:'Access denied to this dashboard'});const d=DASHBOARDS[m[1]];if(!d)return send(404,{message:'Dashboard not found'});return send(200,{dashboard:d.dashboard,meta:{slug:d.slug,url:'/grafana/d/'+m[1]+'/'+d.slug,folderTitle:d.folder,folderUid:d.folderUid,canEdit:false}});}
   m=path.match(/^\/api\/library-elements\/([\w-]+)$/);
   if(m)return m[1]===library.uid?send(200,{result:library}):send(404,{message:'library element could not be found'});
   if(path==='/api/frontend/settings')return send(200,{defaultDatasource:'Prometheus',datasources:{Prometheus:{uid:'prom-main',type:'prometheus',isDefault:true},'Game DB':{uid:'pg-game',type:'grafana-postgresql-datasource'}}});
   if(path==='/api/ds/query'&&req.method==='POST'){
    const b=JSON.parse(body||'{}');
    if(!Array.isArray(b.queries)||!b.queries.length||!b.from||!b.to)return send(400,{message:'bad request: queries, from and to are required'});
    const uids=new Set(b.queries.map(q=>q.datasource?.uid));
    if(uids.size>1&&!uids.has('__expr__'))return send(400,{message:'all queries must use the same datasource'});
    if(b.queries.some(q=>/slow/.test(q.expr||'')))return;// never answers
    const from=Number(b.from),to=Number(b.to);
    const results={};
    for(const q of b.queries){
     if(/\$\w/.test((q.expr||'').replace(/\$__\w+/g,''))||/\$\{/.test(q.rawSql||'')){results[q.refId]={status:400,error:'unresolved template variable in query'};continue;}
     if(/rate\(match_duration_bucket/.test(q.expr||'')){results[q.refId]={status:200,frames:[]};continue;}
     if(/broken/.test(q.expr||'')){results[q.refId]={status:400,error:'parse error at char 5: unexpected identifier'};continue;}
     results[q.refId]={status:200,frames:frames(q,from,to)};
    }
    return send(200,{results});
   }
   if(path.startsWith('/render/d-solo/'))return send(404,{message:'Rendering plugin not installed'});
   send(404,{message:'Not found'});
  });
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r({url:'http://127.0.0.1:'+server.address().port+'/grafana',port:server.address().port,calls,close:()=>new Promise(c=>{server.closeAllConnections?.();server.close(c);})})));
}
module.exports={start,TOKEN,UID,DAY};
