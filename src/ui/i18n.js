// Interface language in the renderer. Load right after i18n-core.js, before any other script or markup.
// The interface is written in Russian; when another language is active, every Russian text node and
// label attribute that appears in the document is translated as it is inserted (MutationObserver runs
// before paint, so the Russian text never shows). User and model content is never translated:
// chat message text, inputs, editable areas and anything inside [data-no-i18n] / [translate="no"].
// New code may also call window.t('Русский текст') for strings that do not go through the DOM.
(()=>{
 const boot=window.petyaInterfaceLanguage||{language:'ru',preference:'system',strings:{}};
 const translator=window.PetyaI18nCore.create(boot.language==='ru'?{}:boot.strings);
 window.petyaLanguage=boot.language;
 window.petyaLocale=boot.language==='ru'?'ru-RU':'en-US';
 window.t=text=>boot.language==='ru'?text:translator.translate(text);
 document.documentElement.lang=boot.language;
 if(boot.language==='ru')return;
 const ATTRIBUTES=['title','aria-label','placeholder','alt','data-label','aria-description'];
 const SKIP='.message-content,.message-user,textarea,[contenteditable=""],[contenteditable="true"],[data-no-i18n],[translate="no"],script,style,pre,code';
 const excluded=element=>!element||!!element.closest(SKIP);
 function text(node){
  const value=node.nodeValue;if(!value||!/[А-Яа-яЁё]/.test(value)||excluded(node.parentElement))return;
  const next=translator.translate(value);if(next!==value)node.nodeValue=next;
 }
 function attributes(element){
  for(const name of ATTRIBUTES){const value=element.getAttribute(name);if(!value||!/[А-Яа-яЁё]/.test(value))continue;const next=translator.translate(value);if(next!==value)element.setAttribute(name,next);}
  if(element.tagName==='INPUT'&&/^(button|submit|reset)$/.test(element.type)&&/[А-Яа-яЁё]/.test(element.value))element.value=translator.translate(element.value);
 }
 function walk(root){
  if(root.nodeType===3)return text(root);
  if(root.nodeType!==1||excluded(root))return;
  attributes(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:node=>node.nodeType===1&&node.matches(SKIP)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  for(let node=walker.nextNode();node;node=walker.nextNode()){if(node.nodeType===3)text(node);else attributes(node);}
 }
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='childList')record.addedNodes.forEach(walk);
   else if(record.type==='characterData')text(record.target);
   else if(record.type==='attributes')attributes(record.target);
  }
 }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRIBUTES});
 walk(document.documentElement);
 if(document.title)document.title=translator.translate(document.title);
 // Native dialogs do not go through the DOM.
 for(const name of ['alert','confirm','prompt']){const original=window[name];if(typeof original==='function')window[name]=(message,...rest)=>original.call(window,typeof message==='string'?translator.translate(message):message,...rest);}
})();
