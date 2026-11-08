// Interface rule: every «Удалить» is a red trash-can icon button (see AGENTS.md → «Interface rules»).
// window.deleteButton(label, onClick) makes one; window.asDeleteButton(button, label) turns an existing button
// into one. The label stays as the tooltip and the accessible name, so the action is never unnamed.
(()=>{
 const trash='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
 window.petyaIcons={...(window.petyaIcons||{}),trash};
 window.asDeleteButton=(button,label)=>{
  const text=String(label||button.getAttribute('aria-label')||button.title||button.textContent||'Удалить').trim();
  button.type='button';button.classList.add('delete-button');button.innerHTML=trash;button.title=text;button.setAttribute('aria-label',text);
  return button;
 };
 window.deleteButton=(label,onClick)=>{const b=document.createElement('button');if(onClick)b.onclick=onClick;return window.asDeleteButton(b,label);};
})();
