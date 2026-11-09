// Which project of a tracker a request or discussion is about: the project named in the command, else the one named
// in the chosen discussion, else the only one. Service-neutral — Jira (src/extensions/jira/routing.cjs) and Asana
// (src/extensions/asana/asana.cjs) pass their own project lists `{key, name}`; a key also matches issue keys «KEY-12».
const normalize = s => String(s || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, ' ').trim();
function matches(text, projects) {
  const haystack = ' ' + normalize(text) + ' ';
  return projects.filter(p => [p.key, p.name].some(value => {
    const needle = normalize(value);
    return needle && (haystack.includes(' ' + needle + ' ') || new RegExp('(?:^|\\s)' + p.key.replace(/[^a-z0-9_]/gi,'') + '-[0-9]+(?:\\s|$)', 'i').test(haystack));
  }));
}
function choose(command, context, projects) {
  const explicit = matches(command, projects);
  if (explicit.length) return explicit.length === 1 ? { project: explicit[0], reason: 'Проект указан в команде' } : { reason: 'В команде упомянуты разные проекты' };
  const found = matches([context.title, context.text, context.url, context.source].filter(Boolean).join('\n'), projects);
  if (found.length) return found.length === 1 ? { project: found[0], reason: 'Проект найден в выбранном обсуждении' } : { reason: 'В обсуждении упомянуты разные проекты' };
  return projects.length === 1 ? { project: projects[0], reason: 'Единственный разрешённый проект' } : { reason: 'Недостаточно контекста для выбора проекта', semantic: true };
}
module.exports = { matches, choose };
