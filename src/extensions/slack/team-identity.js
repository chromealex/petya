(() => {
 // The Slack row of «В сервисах» on the cards of «Команда» (window.petyaTeamIdentities, src/ui/team.js): the person's
 // Slack member ID (Profile → ⋮ → Copy member ID), kept in the person's `slackId` and `accounts.slack`.
 const node = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
 window.petyaTeamIdentities ||= { list: [], register(identity) { if (identity?.service && !this.list.some(i => i.service === identity.service)) this.list.push(identity); } };
 window.petyaTeamIdentities.register({
  service: 'slack', title: 'Slack', field: 'slackId', order: 10,
  link(panel, open, { field, read, write, mark, paint }) {
   const input = node('input'); input.placeholder = 'U012ABCDEF'; input.maxLength = 80; input.setAttribute('aria-label', 'Slack member ID');
   const save = node('button', null, 'Готово'); save.type = 'button'; const hint = node('p', 'small', 'В Slack: профиль человека → ⋮ → «Copy member ID».');
   const bar = node('div', 'team-account-search'); bar.append(input, save); panel.append(bar, hint);
   open.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) { input.value = field('slackId')?.value || ''; input.focus(); } };
   const apply = () => {
    const v = input.value.trim().toUpperCase(); if (v && !/^[UW][A-Z0-9]+$/.test(v)) { hint.textContent = 'ID выглядит как U012ABCDEF — это не имя и не ссылка.'; return; }
    const kept = field('slackId'); if (kept) kept.value = v;
    const next = read(); if (v) { next.slack = next.slack?.id === v ? next.slack : { id: v }; } else delete next.slack; write(next); panel.hidden = true; mark(); paint();
   };
   save.onclick = apply; input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); } if (e.key === 'Escape') { e.stopPropagation(); panel.hidden = true; } });
  }
 });
})();
