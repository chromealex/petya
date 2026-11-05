const fs = require('node:fs');
const path = require('node:path');
const cancel = require('../answer-cancel.cjs');
const directory = path.join(__dirname, '../extensions');
const providers = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
  .map(entry => path.join(directory, entry.name, 'desktop-reply.cjs')).filter(file => fs.existsSync(file)).map(file => require(file));
const flag = p => 'extension_' + p.type;
const list = settings => providers.map(p => ({ id:p.type, name:p.name, description:p.description,
  installed:settings?.[flag(p)] === 'true' }));
const limitKey = 'extensionDownloadLimitMB';
function needsApproval(bytes, settings) {
  return !Number.isSafeInteger(bytes) || bytes < 0 || bytes > Number(settings[limitKey] ?? 100) * 1024 * 1024;
}
const sessions = new WeakMap();
function setup(s) {
  const installations = new Map();
  const progress = new Map();
  async function activate(p,check) {
    if (s.settings[flag(p)] === 'true') return true;
    if (!p.install) {
      s.saveSettings({[flag(p)]:'true'});
      return true;
    }
    if (installations.has(p.type)) {
      await installations.get(p.type);
      check();
      return s.settings[flag(p)] === 'true';
    }
    const publish = (text,busy,error=false) => {
      const item = {id:'extension-install-'+p.type,title:p.name,text,busy,kind:error?'error':'info'};
      progress.set(p.type,item);
      if (s.win && !s.win.isDestroyed()) s.win.webContents.send('extension-install-progress',item);
    };
    const install = async () => {
      try {
        const bytes = await p.downloadBytes(s);
        check();
        if (needsApproval(bytes,s.settings)) {
          const size = Number.isSafeInteger(bytes) && bytes >= 0 ? Math.ceil(bytes/1048576)+' МиБ' : 'размер неизвестен';
          const result = await require('electron').dialog.showMessageBox(s.win,{message:'Скачать расширение «'+p.name+'»?',
            detail:size,buttons:['Отмена','Скачать'],defaultId:0,cancelId:0});
          check();
          if (result.response !== 1) return false;
        }
        publish('Устанавливаю расширение…',true);
        await p.install(s,check,message=>publish(message,true));
        check();
        s.saveSettings({[flag(p)]:'true'});
        publish('Расширение установлено.',false);
        return true;
      } catch(error) { publish(error.message,false,true); throw error; }
    };
    installations.set(p.type,install());
    try { return await installations.get(p.type); }
    finally { installations.delete(p.type); }
  }
  async function turn(command, authorize = () => {}) {
    const dialogue = s.dialogue, topic = dialogue.active(), company = s.companyId;
    const project = dialogue.state.activeProjectId, version = topic?.versionIndex;
    function check() {
      cancel.check(); authorize();
      if (company !== s.companyId || dialogue !== s.dialogue || topic !== dialogue.active() ||
          version !== topic?.versionIndex || project !== dialogue.state.activeProjectId) throw Error('Чат изменился. Повторите запрос.');
    }
    const files = s.attachments.list();
    const context = { files, topic, settings:s.settings };
    const last=s.chatResults?s.chatResults.current(topic,'extensionResult'):require('../extensions/previous-reply.cjs')(topic)?.extensionResult;
    const refresh=!files.length && last?.project===project && /^(?:обнови(?: результат| отчёт| отчет| диаграмму)?|покажи ещё раз|покажи еще раз)[.!?]*$/iu.test(command.trim());
    const requested=/^только\s+(.+?)\s*$/iu.exec(command.trim())?.[1];
    const pick=!files.length && last?.project===project && requested && last.choices?.find(key=>key.toLowerCase()===requested.toLowerCase());
    const continuing=refresh||!!pick,query=continuing?last.query:command;
    const matches = providers.filter(p => (!files.length || p.acceptsFiles?.(files)) && (!continuing||p.type===last.provider) && p.matches(query, context));
    // Requests Petya's own handlers own (Jira tasks and bugs, work reports, Slack digest, weather, rates) never go to
    // the model-picked extension: «Какие на мне таски?» was sent to Unity. Naming the extension still selects it.
    const named=providers.some(p=>[p.name,p.type].filter(Boolean).some(n=>String(command).toLowerCase().includes(String(n).toLowerCase())));
    if (!matches.length && !files.length && (named || !ownedByPetya(command,topic))) {
      const selected=await require('../extensions/agent.cjs').select(s,command,providers);
      check();
      if(selected){
        s.requestProgress.report('Использую расширение «'+selected.name+'».');
        if(!await activate(selected,check))return {handled:true,text:'Установка отменена.'};
        check();
        return selected.agentTurn(s,command,authorize);
      }
    }
    if (matches.length !== 1) return null;
    const p = matches[0];
    check();
    if (p.service) {
      const access = await s.serviceAccess.offer('Проверь ' + p.name + ': ' + command, topic);
      check();
      if (access) return access;
    }
    const notice = 'Использую расширение «' + p.name + '».';
    s.requestProgress.report(notice);
    if (!await activate(p,check)) return {handled:true,text:'Установка отменена.'};
    check();
    if (p.turn) return p.turn(s, command, context, check);
    let content,source,base,choices,problem;
    const selected=pick||(refresh&&last.selected)||null;
    try {
      const scope=p.scope(s,topic);
      base=p.source?.(scope,s) || p.name;
      if(continuing && last.base && base!==last.base)return {handled:true,text:'Источник этого отчёта изменился. Укажите его в новом запросе.'};
      if(selected)p.select(scope,selected);
      source=selected?base.split(' · ')[0]+' · '+selected:base;
      content=await p.answer(query,scope);
      choices=continuing?last.choices:p.choices?.(scope);
    } catch(error) {
      check();
      problem=p.service && require('../connection-failure.cjs').classify(error);
      if(!problem)throw error;
      content=[{type:'text',text:p.name+' · '+problem.message}];
    }
    check();
    const text = [notice,...content.filter(block => block.type === 'text').map(block => block.text)].join('\n');
    dialogue.rememberAction(command, text);
    const owner = dialogue.active(), message = owner.messages.at(-1);
    message.by = p.name;
    message.extensionResult={provider:p.type,query,source:source||p.name,base,choices,selected,project};
    if(problem)message.serviceProblem={id:p.type,query:'Обнови результат'};
    message.extensionImages = content.filter(block => block.type === 'image');
    dialogue.persist();s.chatResults?.adopt(owner,message);
    return { handled:true, text, by:p.name, topicId:owner.id, topicTitle:owner.title, messages:owner.messages };
  }
  const catalog = () => list(s.settings);
  sessions.set(s.dialogue, {turn, catalog});
  return { extensionReplies:{turn}, ipc:{ catalog, progress:()=>[...progress.values()], limit:() => s.settings[limitKey],
    setLimit(value) { validate({[limitKey]:value}); s.saveSettings({[limitKey]:value}); } } };
}
function ownedByPetya(command,topic){try{return require('../dialogue.cjs').intent(command)!=='chat'||!!require('../work-query-route.cjs').classify(command,topic||{})||!!require('../slack-digest.cjs').question(command)||!!require('./fresh-data.cjs').weatherQuestion(command)||!!require('./fresh-data.cjs').rateQuestion(command);}catch{return false;}}
async function turnForAttachments(s,ids,command) {
  const files = s.attachments.list();
  if (!files.length || !Array.isArray(ids) || files.length !== ids.length || !files.every(f=>ids.includes(f.id))) return null;
  return sessions.get(s.dialogue)?.turn(command);
}
function validate(settings) {
  if (!/^\d{1,6}$/.test(settings[limitKey])) throw Error('Введите целое число от 0 до 999999 МиБ.');
}
function register(server,z,ctx) {
  const session = sessions.get(ctx.dialogue);
  if (!session) return;
  server.registerTool('list_chat_extensions',{description:'Расширения текущей компании и их возможности.',inputSchema:{}},async()=>{
    ctx.check();
    return {content:[{type:'text',text:JSON.stringify(session.catalog())}]};
  });
  if (ctx.access?.mode !== 'edit') return;
  server.registerTool('use_chat_extension',{description:'Подобрать расширение для запроса в активном чате и добавить его ответ.',inputSchema:{
    chatId:z.string().min(1),command:z.string().trim().min(1).max(4000)
  }},async ({chatId,command})=>{
    const check = () => {
      ctx.check();
      const topic = ctx.dialogue.active();
      if (!topic || topic.archived || !ctx.dialogue.state.projects.some(p=>p.id===topic.projectId && !p.archived) || topic.id !== chatId || ctx.access.projectId && ctx.access.projectId !== topic.projectId)
        throw Error('Откройте чат в разрешённом проекте.');
      if (ctx.chatJobs?.busy(chatId)) throw Error('Дождитесь завершения запроса в чате.');
    };
    try {
      check();
      const project = ctx.dialogue.state.projects.find(p=>p.id === (ctx.dialogue.active().projectId || 'general'));
      const reply = await ctx.run(()=>require('../modules.cjs').withProject(project,()=>session.turn(command,check)));
      check();
      if (reply?.topicId) ctx.changed?.({owner:reply.topicId,name:'use_chat_extension'});
      const imageBlocks = reply?.messages?.at(-1)?.extensionImages || [];
      return {content:[{type:'text',text:reply?.text || 'Подходящее расширение не найдено.'},...imageBlocks]};
    } catch(error) { return {isError:true,content:[{type:'text',text:error.message}]}; }
  });
}
module.exports = {name:'extensionReplies', setup, register, turnForAttachments, ownedByPetya, needsApproval, validate,
  defaults:{[limitKey]:'100',...Object.fromEntries(providers.map(p=>[flag(p),'false']))}};
