// Subprojects: a project with `parentId` sits inside another project and inherits its context.
// A subproject keeps its own values in `own*` fields; the effective values (parent's plus its own)
// are materialized onto the usual fields, so every existing reader of `folders`, `context`,
// `disabledServices` and `memoryId` sees the inherited settings without knowing about the tree.
const MAX_DEPTH = 3;
const OWN = { folders: 'ownFolders', context: 'ownContext', disabledServices: 'ownDisabledServices', memoryId: 'ownMemoryId' };

const byId = (projects, id) => projects.find(p => p.id === id);

// Root first, the project itself last. Stops on a missing parent or a cycle.
function chain(projects, project) {
  const out = [], seen = new Set();
  for (let node = project; node && !seen.has(node.id); node = node.parentId ? byId(projects, node.parentId) : null) { seen.add(node.id); out.unshift(node); }
  return out;
}

function isDescendant(projects, id, ancestorId) {
  for (let node = byId(projects, id), seen = new Set(); node?.parentId && !seen.has(node.id); node = byId(projects, node.parentId)) {
    seen.add(node.id);
    if (node.parentId === ancestorId) return true;
  }
  return false;
}

function subtreeDepth(projects, id, seen = new Set()) {
  if (seen.has(id)) return 0;
  seen.add(id);
  return 1 + Math.max(0, ...projects.filter(p => p.parentId === id).map(p => subtreeDepth(projects, p.id, seen)));
}

// Throws when `parentId` cannot hold `id` (unknown, general, self, a descendant, archived, or too deep).
function assertParent(projects, id, parentId) {
  if (!parentId) return;
  const parent = byId(projects, parentId);
  if (!parent) throw Error('Родительский проект не найден.');
  if (parent.id === 'general') throw Error('В «Общее» нельзя добавить подпапку.');
  if (id === 'general') throw Error('«Общее» нельзя вложить в другой проект.');
  if (parentId === id || id && isDescendant(projects, parentId, id)) throw Error('Нельзя вложить проект сам в себя.');
  if (parent.archived) throw Error('Родительский проект в архиве.');
  const depth = chain(projects, parent).length + (id && byId(projects, id) ? subtreeDepth(projects, id) : 1);
  if (depth > MAX_DEPTH) throw Error('Вложенность — не больше ' + MAX_DEPTH + ' уровней.');
}

const ownFolders = p => Array.isArray(p.folders) ? p.folders : p.folder ? [p.folder] : [];

// Convert a project between root (plain fields are its own) and subproject (own* fields + materialized plain fields).
function setParent(projects, project, parentId) {
  parentId = parentId || '';
  assertParent(projects, project.id, parentId);
  if (parentId && !project.parentId) {
    project.ownFolders = ownFolders(project);
    project.ownContext = project.context || '';
    project.ownDisabledServices = [...(project.disabledServices || [])];
    project.ownMemoryId = project.memoryId || '';
  } else if (!parentId && project.parentId) {
    project.folders = [...(project.ownFolders || [])];
    project.folder = project.folders[0] || '';
    project.context = project.ownContext || '';
    project.disabledServices = [...(project.ownDisabledServices || [])];
    project.memoryId = project.ownMemoryId || '';
    for (const key of Object.values(OWN)) delete project[key];
  }
  if (parentId) project.parentId = parentId; else delete project.parentId;
}

// Store edited values as the project's own: plain fields for a root, own* fields for a subproject.
function assignOwn(project, data) {
  for (const [plain, own] of Object.entries(OWN)) {
    if (!(plain in data)) continue;
    if (project.parentId) project[own] = Array.isArray(data[plain]) ? [...data[plain]] : data[plain];
    else project[plain] = data[plain];
  }
  if (!project.parentId && 'folders' in data) project.folder = data.folders[0] || '';
  else if (!project.parentId && 'folder' in data) project.folder = data.folder;
}

// The values the user edits in project settings.
function own(project) {
  if (!project?.parentId) return { folders: ownFolders(project || {}), context: project?.context || '', disabledServices: project?.disabledServices || [], memoryId: project?.memoryId || '' };
  return { folders: project.ownFolders || [], context: project.ownContext || '', disabledServices: project.ownDisabledServices || [], memoryId: project.ownMemoryId || '' };
}

// Recompute inherited values for every subproject, parents before children. Broken links are dropped.
function materialize(projects) {
  for (const p of projects) {
    if (!p.parentId) continue;
    const parent = byId(projects, p.parentId), path = chain(projects, p);
    if (!parent || parent.id === 'general' || path[0].parentId || path.length > MAX_DEPTH) setParent(projects, p, '');
  }
  const ordered = [...projects].sort((a, b) => chain(projects, a).length - chain(projects, b).length);
  for (const p of ordered) {
    if (!p.parentId) continue;
    const parent = byId(projects, p.parentId);
    const folders = [...new Set([...(p.ownFolders || []), ...ownFoldersEffective(parent)])].slice(0, 40);
    p.folders = folders; p.folder = folders[0] || '';
    p.context = [parent.context, p.ownContext].map(s => String(s || '').trim()).filter(Boolean).join('\n\n');
    p.disabledServices = [...new Set([...(parent.disabledServices || []), ...(p.ownDisabledServices || [])])];
    p.memoryId = p.ownMemoryId || parent.memoryId || '';
  }
  return projects;
}
const ownFoldersEffective = p => Array.isArray(p?.folders) ? p.folders : p?.folder ? [p.folder] : [];

const path = (projects, project) => chain(projects, project).map(p => p.name).join(' / ');
const descendants = (projects, id) => projects.filter(p => p.id !== id && chain(projects, p).some(a => a.id === id));

module.exports = { MAX_DEPTH, chain, path, descendants, isDescendant, assertParent, setParent, assignOwn, own, materialize };
