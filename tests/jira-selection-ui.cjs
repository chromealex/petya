const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1180, height: 1000 });
  try {
    let html = fs.readFileSync(path.join(__dirname, '../src/ui/index.html'), 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
    const template=fs.readFileSync(path.join(__dirname,'../src/extensions/jira/settings.html'),'utf8');
    html=html.replace('<button class="primary" type="submit">Сохранить подключения</button>',template+'<button class="primary" type="submit">Сохранить подключения</button>');
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname, '../src/ui/style.css'), 'utf8'));
    await win.webContents.executeJavaScript(`
      const $ = id => document.getElementById(id);
      function connectionNode(tag, text, cls) { const n = document.createElement(tag); n.textContent = text || ''; n.className = cls || ''; return n; }
      const connectionsReady = Promise.resolve();
      let fail = false, delayedResolve;
      window.petya = {
        settings: async () => ({ hasJiraToken: false }),
        jiraChoices: async project => {
          if (fail) throw new Error('Нет доступа');
          if (project === 'SLOW') return new Promise(r => { delayedResolve = r; });
          if (!project) return { projects: [{key:'ONE',name:'Первый проект'}, {key:'TWO',name:'Второй проект'}, {key:'SLOW',name:'Медленный проект'}] };
          return { issueTypes:[{id:project+'-type',name:'Задача'}], boards:[{id:project+'-board',name:'Команда '+project}], versions:[], warnings:[] };
        }
      };
      document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'settings');
      document.querySelectorAll('#settings article').forEach(a => { a.hidden = !a.querySelector('[name=jiraUrl]'); });
      document.querySelector('[name=jiraUrl]').value = 'https://company.atlassian.net';
    `);
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, '../src/extensions/jira/settings.js'), 'utf8'));
    await win.webContents.executeJavaScript(`(async () => {
      function check(condition, message) { if (!condition) throw new Error(message); }
      await refreshJiraChoices();
      const boxes = [...$('jira-projects').querySelectorAll('input')]; boxes[0].click();
      $('jira-projects').querySelectorAll('input')[1].click();
      check(jiraField('jiraProjects').value === 'ONE,TWO', 'Multiple projects lost');
      jiraField('jiraProject').value = 'ONE'; await loadJiraDetails();
      jiraField('jiraBoardId').value = 'ONE-board';
      jiraField('jiraProject').value = 'TWO'; await loadJiraDetails();
      check(jiraField('jiraBoardId').value === '', 'Foreign board retained');
      check(jiraField('jiraIssueType').value === 'TWO-type', 'Wrong issue type');
      const data = Object.fromEntries(new FormData(jiraForm));
      check(data.jiraProjects === 'ONE,TWO' && data.jiraProject === 'TWO', 'Form serialization lost selections');
      fail = true; await refreshJiraChoices();
      check($('jira-choices-status').textContent.includes('Нет доступа'), 'Missing API error');
      check(jiraField('jiraProjects').value === 'ONE,TWO', 'Failure lost selected projects');
      fail = false; await refreshJiraChoices();
      $('jira-projects').querySelectorAll('input')[2].click();
      jiraField('jiraProject').value = 'SLOW'; const slow = loadJiraDetails();
      jiraField('jiraProject').value = 'TWO'; await loadJiraDetails();
      delayedResolve({issueTypes:[{id:'stale',name:'Устарело'}],boards:[],versions:[],warnings:[]}); await slow;
      check(jiraField('jiraIssueType').value === 'TWO-type', 'Stale response overwrote project');
      $('jira-projects').querySelectorAll('input')[2].click();
      document.querySelector('[name=jiraUrl]').scrollIntoView();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 400));
    fs.writeFileSync('/tmp/petya-jira-selection.png', (await win.webContents.capturePage()).toPNG());
    console.log('Jira UI: multi-select, form persistence, project switching, errors and stale replies passed');
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
