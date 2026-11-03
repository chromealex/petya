let asanaVoiceBusy = false;
async function prepareSpokenAsana(context, project = '') {
  if (asanaVoiceBusy) return;
  asanaVoiceBusy = true;
  let result;
  try { result = await window.petya.asanaVoicePrepare(commandSnapshot, context.id, project); }
  finally { asanaVoiceBusy = false; }
  routePanel.replaceChildren(); routePanel.hidden = false; $('resolution').hidden = true;
  const title = document.createElement('h2'); title.textContent = 'Задача Asana'; routePanel.append(title);
  if (!result.ready) {
    if (result.questions?.length) {
      const question = document.createElement('p'); question.textContent = result.questions.join(' '); routePanel.append(question);
      askVoiceQuestion(question.textContent, async answer => {commandSnapshot += '\nУточнение пользователя: '+answer; await prepareSpokenAsana(context,result.project);});
      return;
    }
    const options = result.projects.map(p=>({label:p.name,names:[p.name,p.key],run:()=>prepareSpokenAsana(context,p.key)}));
    const help = document.createElement('p'); help.textContent = result.reason; routePanel.append(help);
    for (const option of options) {const b=document.createElement('button');b.type='button';b.textContent=option.label;b.onclick=run(option.run);routePanel.append(b);}
    askVoiceChoices(result.reason,options);return;
  }
  voiceReply = null;
  const summary=document.createElement('p');summary.textContent=result.project+' · '+result.after.name;routePanel.append(summary);
  const body=document.createElement('p');body.textContent=result.after.notes;routePanel.append(body);
  let sent = false;
  const submit=async()=>{
    if(sent)return;sent=true;automaticVoiceCommand=false;asanaVoiceBusy=true;
    routePanel.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {const task=await window.petya.asanaApply(result.id);summary.textContent='Создана задача Asana · '+task.url;notice(summary.textContent);await window.petya.notify('Создана задача Asana: '+result.after.name);}
    catch(e){notice(e.message,true);await window.petya.requestAttention();throw e;}
    finally {asanaVoiceBusy=false;}
  };
  if(automaticVoiceCommand) await submit();
  else {const button=document.createElement('button');button.type='button';button.textContent='Создать задачу в Asana';button.onclick=run(submit);routePanel.append(button);}
}
