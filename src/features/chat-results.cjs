const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'../extensions');
const adapters=fs.readdirSync(root,{withFileTypes:true}).filter(row=>row.isDirectory())
  .map(row=>path.join(root,row.name,'result.cjs')).filter(file=>fs.existsSync(file)).map(file=>require(file));

// Plugins turn a service result (e.g. Google Play rows) into card data with `extract(result)` → {dataKey: value};
// the host only stores it on the message as extensionData, the plugin's renderer draws it.
function extract(result){
  const data={};
  for(const adapter of adapters){if(typeof adapter.extract!=='function')continue;try{Object.assign(data,adapter.extract(result)||{});}catch{}}
  return Object.keys(data).length?data:undefined;
}
function collect(topic,services){
  return (topic?.messages||[]).flatMap((message,index)=>adapters.flatMap(adapter=>
    (adapter.describe(message,topic,services)||[]).map(result=>({
      ...result,adapter,message,index,
      objectId:createHash('sha256').update(JSON.stringify([adapter.id,result.key])).digest('hex'),
      id:createHash('sha256').update(JSON.stringify([index,message.at||0,adapter.id,result.key])).digest('hex')
    }))));
}
function scope(services,topic){
  return JSON.stringify([services.companyId,topic.id,topic.projectId||'general',topic.versionIndex||0]);
}
function setup(s){
  function topicFor(expected){
    const topic=s.dialogue.active();
    if(!topic||topic.archived||expected!==scope(s,topic)||
       !s.dialogue.state.projects.some(p=>p.id===(topic.projectId||'general')&&!p.archived))throw Error('Чат изменился. Выберите объект заново.');
    return topic;
  }
  function selected(topic){
    if(!topic)return null;
    const choice=topic.resultChoice,rows=collect(topic,s);
    if(choice?.scope===scope(s,topic))return rows.find(row=>row.id===choice.id)||null;
    const recent=rows.filter(row=>row.message===rows.at(-1)?.message);
    return recent.length===1?recent[0]:null;
  }
  function snapshot(){
    const topic=s.dialogue.active();
    if(!topic||topic.archived)return {scope:null,items:[],selected:null};
    const rows=collect(topic,s);
    return {scope:scope(s,topic),selected:selected(topic)?.id||null,
      items:rows.map(({id,objectId,index,title,subtitle,actions,presentationKey})=>({id,objectId,index,title,subtitle,presentationKey,actions:actions.map(({id,label,hidden})=>({id,label,hidden:!!hidden}))}))};
  }
  function choose(expected,id){
    const topic=topicFor(expected);
    if(s.chatJobs?.busy(topic.id))throw Error('Дождитесь завершения ответа перед сменой объекта.');
    const rows=collect(topic,s);
    if(id!==null&&!rows.some(row=>row.id===id))throw Error('Объект больше недоступен в этом чате.');
    topic.resultChoice={scope:expected,id};s.dialogue.persist();return snapshot();
  }
  function adopt(topic,message){
    if(!topic)return;
    const rows=collect(topic,s).filter(row=>row.message===message);
    if(rows.length){topic.resultChoice={scope:scope(s,topic),id:rows.length===1?rows[0].id:null};s.dialogue.persist();}
  }
  function current(topic,field){
    return selected(topic)?.message?.[field];
  }
  async function execute(row,action,topic,args){
    const expected=scope(s,topic);
    const check=()=>{
      require('../answer-cancel.cjs').check();
      topicFor(expected);
      if(!collect(topic,s).some(item=>item.id===row.id))throw Error('Объект изменился.');
    };
    check();
    if(action.id==='edit')return s.chatChanges.start(row,expected);
    if(action.id==='details')return {handled:true,text:row.title+'\n'+row.subtitle,resultJump:row.index};
    const project=s.dialogue.state.projects.find(p=>p.id===(topic.projectId||'general'));
    // Card controls (status chips, checkboxes, replies) pass small JSON arguments to the extension's adapter.
    const result=await require('../modules.cjs').withProject(project,()=>row.adapter.perform(action.id,row,s,check,args));
    check();return result;
  }
  async function action(expected,id,actionId,args){
    if(args!==undefined&&(typeof args!=='object'||args===null||JSON.stringify(args).length>20000))throw Error('Некорректные параметры действия.');
    const topic=topicFor(expected),row=collect(topic,s).find(item=>item.id===id);
    if(s.chatJobs?.busy(topic.id))throw Error('Дождитесь завершения ответа.');
    const action=row?.actions.find(item=>item.id===actionId);
    if(!action)throw Error('Действие больше недоступно.');
    choose(expected,id);
    if(action.command)return {command:action.command};
    return execute(row,action,topic,args);
  }
  async function turn(command){
    const change=await s.chatChanges?.turn(command);if(change)return change;
    const normalized=command.trim().replace(/[.!?]+$/u,'').toLowerCase();
    const actionId=new Map([['измени','edit'],['изменить','edit'],['открой','open'],['обнови','refresh'],['обнови результат','refresh'],['обнови отчёт','refresh'],['обнови отчет','refresh'],
      ['покажи подробнее','details'],['подробнее','details'],['поверни','rotate'],
      ['покажи в папке','reveal']]).get(normalized);
    if(!actionId)return null;
    const topic=s.dialogue.active();
    if(!topic)return null;
    const rows=collect(topic,s),row=selected(topic);
    if(!rows.length)return null;
    const candidates=[...new Map(rows.filter(item=>item.actions.some(a=>a.id===actionId)).map(item=>[item.objectId,item])).values()];
    if(!row){
      if(!candidates.length)return {handled:true,text:'Сначала выберите объект в чате.'};
      return {handled:true,question:true,text:'К какому объекту применить действие?',resultChoices:candidates.map(item=>item.id),resultAction:actionId};
    }
    const action=row.actions.find(item=>item.id===actionId);
    if(!action)return {handled:true,text:'Для «'+row.title+'» это действие недоступно. Выберите другой объект над полем ввода.'};
    if(action.command)return {resultCommand:action.command};
    return execute(row,action,topic,args);
  }
  return {chatResults:{current,adopt,turn,selected},ipc:{snapshot,choose,action}};
}
module.exports={name:'chatResults',setup,collect,scope,extract};
