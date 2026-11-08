// Real files from chat: Word, Excel, PowerPoint and PDF.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const office=require('../src/office-files.cjs');
const feature=require('../src/features/office-files.cjs');
const {unzip}=require('../src/skill-library/installed.cjs');
const {Dialogue}=require('../src/dialogue.cjs');
const part=(bytes,name)=>unzip(bytes).find(f=>f.name===name)?.data.toString('utf8');
(async()=>{
 // Requests: making a file versus talking about one.
 const {intent}=feature;
 assert.equal(intent('Сделай презентацию по итогам спринта').format,'pptx');
 assert.equal(intent('Выгрузи это в Excel').format,'xlsx');
 assert.equal(intent('Оформи это документом Word').format,'docx');
 assert.equal(intent('сделай pdf из отчёта').format,'pdf');
 assert.deepEqual(intent('/docx релиз-ноты 1.20'),{format:'docx',request:'релиз-ноты 1.20'});
 for(const text of ['Создай задачу в Jira про экспорт в PDF','Прочитай этот pdf','Что в этом документе Word?','Напиши письмо Борису и приложи pdf','Как сделать презентацию в PowerPoint?','Добавь слайд про риски','напиши формулу для Excel','нужна помощь с excel','составь план презентации','напиши, как экспортировать в PDF','нужно ли конвертировать в pdf?','сделай мне выжимку из pdf','сделай ревью pdf','сделай excel формулу для суммы','сделай мне кофе и открой excel'])assert.equal(intent(text),null,text);
 assert.deepEqual(intent('Добавь слайд про риски',{previous:{format:'pptx'}}),{format:'pptx',request:'Добавь слайд про риски',revise:true});
 // Word: headings, lists, tables, links and characters XML cannot hold.
 const md='# Отчёт\n\nТекст с **жирным** и [ссылкой](https://example.com/a?b=1&c=2).\n\n- пункт\n  - вложенный\n1. первый\n\n| A | B |\n|---|---|\n| 1 | <2> |\n\nУправляющий символ:\u0007 конец.';
 const doc=office.docx(md,{title:'Отчёт'}),body=part(doc,'word/document.xml');
 assert(body.includes('<w:pStyle w:val="Heading1"/>')&&body.includes('<w:b/>')&&body.includes('<w:tbl>')&&body.includes('&lt;2&gt;'));
 assert(!body.includes('\u0007'),'characters XML cannot hold are dropped');
 assert(part(doc,'word/_rels/document.xml.rels').includes('https://example.com/a?b=1&amp;c=2'));
 assert(part(doc,'word/numbering.xml').includes('w:numId="2"'),'an ordered list gets its own numbering');
 // Excel: numbers stay numbers, formulas stay formulas, sheet names are valid and unique.
 const book=office.xlsx([{name:'Задачи/Итог: [1]',columns:['Ключ','Часы','Вдвое'],rows:[['SEV-1','12','=B2*2'],['SEV-2','4,5','=B3*2']]},{name:'Задачи/Итог: [1]',columns:['x'],rows:[]}]);
 const workbook=part(book,'xl/workbook.xml'),sheet=part(book,'xl/worksheets/sheet1.xml');
 assert(workbook.includes('name="Задачи Итог   1 "')||/name="Задачи Итог\s+1\s*"/.test(workbook));
 assert(/<sheet name="[^"]+ 2"/.test(workbook),'a repeated sheet name gets a number');
 assert(sheet.includes('<c r="B2"><v>12</v></c>')&&sheet.includes('<v>4.5</v>')&&sheet.includes('<f>B2*2</f>'));
 assert(sheet.includes('state="frozen"')&&sheet.includes('<autoFilter ref="A1:C3"/>')&&workbook.includes('_xlnm._FilterDatabase'));
 // PowerPoint: a title slide, bullet slides with levels, slide numbers.
 const deck=office.pptx([{title:'Релиз 1.20',subtitle:'Итоги'},{title:'Сделано',bullets:['Магазин',{text:'Оплата',level:1}]}],{title:'Релиз'});
 assert.equal(unzip(deck).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f.name)).length,2);
 const slide=part(deck,'ppt/slides/slide2.xml');
 assert(slide.includes('<a:buChar char="•"/>')&&slide.includes('<a:buChar char="–"/>')&&slide.includes('2 / 2'));
 assert(part(deck,'ppt/presentation.xml').includes('<p:sldId id="257" r:id="rSlide2"/>'));
 // PDF source: the same Markdown as HTML.
 const page=office.html(md,{title:'Отчёт'});
 assert(page.includes('<table>')&&page.includes('<strong>жирным</strong>')&&page.includes('&lt;2&gt;'));
 assert.equal(office.fileName('Отчёт: Q4/2026?','docx'),'Отчёт Q4 2026.docx');
 assert.equal(office.fileName('  ','pdf'),'Документ.pdf');
 // The feature: content from the chat, a file in the folder, a card on the answer, revisions.
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'petya-office-'));
 const dialogue=new Dialogue({save:()=>{}});
 dialogue.rememberAction('Итоги спринта: магазин готов, оплата в работе, риск — сертификат Apple.','Записал.');
 const asked=[];
 const s={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434'},core:require('../src/core.cjs'),dialogue,officeFolder:()=>folder,
  printToPDF:async html=>Buffer.from('%PDF-1.4 '+html.length),requestProgress:{report(){}},
  request:async(url,o)=>{const b=JSON.parse(o.body);asked.push(b);const props=b.format.properties;
   if(props.slides){const previous=b.messages[1].content.startsWith('Предыдущая');return {message:{content:JSON.stringify({title:'Итоги спринта',summary:previous?'Добавил слайд про риски.':'Три слайда по итогам.',slides:[{title:'Итоги спринта',subtitle:'Север',bullets:[]},{title:'Сделано',bullets:['Магазин готов']},{title:'В работе',bullets:['Оплата']},...(previous?[{title:'Риски',bullets:['Сертификат Apple']}]:[])]})}};}
   if(props.sheets)return {message:{content:JSON.stringify({title:'Задачи',summary:'Таблица задач.',sheets:[{name:'Задачи',columns:['Задача','Статус'],rows:[['Магазин','Готово'],['Оплата','В работе']]}]})}};
   return {message:{content:JSON.stringify({title:'Итоги спринта',summary:'Документ с итогами.',markdown:'# Итоги спринта\n\nМагазин готов, оплата в работе.'})}};}};
 const {officeFiles}=feature.setup(s);
 assert.equal(await officeFiles.turn('Как дела?'),null);
 const made=await officeFiles.turn('Сделай презентацию по итогам спринта');
 assert(made.handled&&/Готово: «Итоги спринта\.pptx» — 3 слайда/.test(made.text),made.text);
 assert(asked[0].messages[1].content.includes('сертификат Apple'),'the content is made from the chat');
 const message=dialogue.active().messages.at(-1),card=message.attachments[0];
 assert(card.generated&&card.localSourcePath===path.join(folder,'Итоги спринта.pptx')&&fs.existsSync(card.localSourcePath));
 assert.equal(unzip(fs.readFileSync(card.localSourcePath)).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f.name)).length,3);
 assert(message.officeFile.text.includes('Оплата'),'a text view of the file stays in the chat');
 const actions=require('../src/extensions/files/result.cjs').describe(message)[0].actions.map(a=>a.id);
 assert.deepEqual(actions,['launch','reveal'],'a made file opens in its app and is not edited as text');
 // A follow-up revises the same file into a new version next to it.
 const revised=await officeFiles.turn('Добавь слайд про риски');
 assert(/Обновил файл: «Итоги спринта \(2\)\.pptx» — 4 слайда/.test(revised.text),revised.text);
 assert(asked.at(-1).messages[1].content.includes('"Сделано"'),'the previous version goes to the model');
 // Excel and PDF too.
 const sheet2=await officeFiles.turn('Выгрузи задачи в Excel');assert(/Задачи\.xlsx/.test(sheet2.text)&&/1 лист, 2 строки/.test(sheet2.text));
 const pdf=await officeFiles.turn('/pdf итоги спринта');assert(fs.readFileSync(dialogue.active().messages.at(-1).attachments[0].localSourcePath,'utf8').startsWith('%PDF'));
 // Without a model Petya says what is missing instead of making an empty file.
 const none=feature.setup({...s,settings:{}}).officeFiles;await assert.rejects(none.turn('Сделай презентацию по итогам'),/локальную модель/);
 // A model answer without content is reported, not saved.
 const empty=feature.setup({...s,request:async()=>({message:{content:JSON.stringify({title:'x',summary:'',slides:[]})}})}).officeFiles;
 await assert.rejects(empty.turn('Сделай презентацию про релиз'),/не смогла подготовить/);
 console.log('Office files: request detection, Word, Excel, PowerPoint and PDF building, chat content, file cards, revisions and failures OK');
})().catch(e=>{console.error(e);process.exit(1);});
