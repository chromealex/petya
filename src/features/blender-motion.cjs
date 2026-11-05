const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { animationMode, animationEdits } = require('../extensions/blender/animation.cjs');

const sessions = new WeakMap();

function setup(s, dialog = () => require('electron').dialog) {
  const requests = new AsyncLocalStorage();
  const files = new Map();
  let operation = null;
  function scope() {
    requests.getStore()?.check();
    const topic = s.dialogue.active();
    if (!topic || topic.archived) throw Error('Откройте чат с запросом на правку анимации.');
    return JSON.stringify([s.companyId, topic.projectId, topic.id, topic.versionIndex || 0]);
  }
  async function pick() {
    const owner = scope();
    const result = await dialog().showOpenDialog(s.win, { title:'Выберите исходник анимации Blender', properties:['openFile'],
      filters:[{name:'Сцена Blender',extensions:['blend']}] });
    if (result.canceled) return null;
    const full = await fs.realpath(result.filePaths[0]);
    if (owner !== scope() || path.extname(full).toLowerCase() !== '.blend' || !(await fs.stat(full)).isFile()) throw Error('Выберите файл .blend в текущем чате.');
    const id = randomUUID();
    files.set(id,{owner, full});
    if (files.size > 512) files.delete(files.keys().next().value);
    return {id, name:path.basename(full)};
  }
  async function resolve(id) {
    const file = files.get(id);
    if (!file || file.owner !== scope() || await fs.realpath(file.full) !== file.full) throw Error('Выберите исходник заново в текущем чате.');
    return {full:file.full,relative:path.basename(file.full)};
  }
  const edits = animationEdits(resolve, () => true, async (detail,message) => {
    const owner = scope();
    const decision = await dialog().showMessageBox(s.win,{message,detail,buttons:['Отмена','Продолжить'],defaultId:0,cancelId:0});
    return decision.response === 1 && owner === scope();
  });
  function publish(id, text, busy, error = false) {
    operation = {id, title:'Анимация Blender',text,busy,kind:error?'error':'info',version:id+':'+text};
    if (s.win && !s.win.isDestroyed()) s.win.webContents.send('blender-motion-progress',operation);
  }
  async function run(text, work) {
    if (operation?.busy) throw Error('Дождитесь завершения текущей операции Blender.');
    const id = 'motion-'+randomUUID();
    publish(id,text,true);
    try {
      const result = await work();
      publish(id,result.saved ? 'Копия сохранена: '+result.saved : result.message || (result.clips?'Выберите клип.':'Превью готово.'),false);
      return result;
    } catch (error) { publish(id,error.message,false,true); throw error; }
  }
  function turn(command, attachment) {
    const mode = animationMode(command + (attachment ? ' анимация' : ''));
    if (!mode) return null;
    const full = attachment && s.attachments.localScene?.(attachment.id);
    const text = 'Использую расширение «Blender». ' + (full ? 'Подготовьте превью движения.' : 'Выберите .blend с анимацией персонажа.');
    s.dialogue.rememberAction(command,text);
    const topic = s.dialogue.active(), message = topic.messages.at(-1);
    message.by = 'Blender'; message.motionMode = mode;
    message.motionId = randomUUID();
    if (full) {
      const id = randomUUID();
      files.set(id,{owner:scope(),full});
      if (files.size > 512) files.delete(files.keys().next().value);
      message.motionFile = {id,name:path.basename(full)};
      s.attachments.remove(attachment.id);
    }
    s.dialogue.persist();
    return {handled:true,by:'Blender',text,topicId:topic.id,topicTitle:topic.title,messages:topic.messages};
  }
  const ipc = {pick, analyze:(...args)=>run('Проверяю ключи движения…',()=>edits.analyze(...args)),
    apply:id=>run('Сохраняю исправленную копию…',()=>edits.apply(id)), status:()=>operation};
  sessions.set(s.dialogue, {ipc, requests});
  return {ipc,blenderMotion:{turn}};
}

function register(server,z,ctx) {
  const session = sessions.get(ctx.dialogue);
  if (!session || ctx.access?.mode !== 'edit') return;
  function tool(name,description,schema,method,argsFor) {
    server.registerTool(name,{description,inputSchema:{chatId:z.string().min(1),...schema}},async args=>{
      function check() {
        ctx.check();
        const chat = ctx.dialogue.active();
        if (!chat || chat.archived || chat.id !== args.chatId || (ctx.access.projectId && ctx.access.projectId !== chat.projectId))
          throw Error('Откройте выбранный чат в разрешённом проекте.');
      }
      try {
        check();
        const result = await ctx.run(()=>session.requests.run({check},()=>session.ipc[method](...argsFor(args))));
        check();
        const {preview,...details} = result || {cancelled:true};
        const content = [{type:'text',text:JSON.stringify(details)}];
        if (preview) content.push({type:'image',mimeType:'image/svg+xml',data:Buffer.from(preview).toString('base64')});
        return {structuredContent:details,content};
      } catch(error) {return {isError:true,content:[{type:'text',text:error.message}]};}
    });
  }
  tool('pick_animation_file','Попросить пользователя выбрать исходник .blend для текущего чата.',{},'pick',()=>[]);
  tool('analyze_animation','Найти скачок движения или убрать избыточные ключи. Возвращает превью или список объектов.',{
    fileId:z.string().min(1), mode:z.enum(['clean','repair']),object:z.string().max(256).default(''),
    tolerance:z.number().min(0).max(1).default(.001)
  },'analyze',a=>[a.fileId,a.mode,a.object,a.tolerance]);
  tool('apply_animation_edit','Сохранить показанную правку в отдельном .blend после подтверждения в Пете.',{
    proposalId:z.string().min(1)
  },'apply',a=>[a.proposalId]);
}
module.exports = {name:'blenderMotion',defaults:{},validate(){},setup,register};
