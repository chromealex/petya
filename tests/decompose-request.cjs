// Decomposition is asked for in everyday words, not only «декомпозируй эту фичу».
const assert = require('assert').strict;
const { decomposeRequest, isJiraCommand } = require('../src/core.cjs');
const { actionRequest } = require('../src/dialogue.cjs');
const { restate } = require('../src/capabilities.cjs');
const asks = ['Петя, декомпозируй эту фичу', 'декомпозь давай', 'давай декомпозь', 'ну декомпозни уже', 'раздекомпозь фичу', 'сделай декомпозицию по доке', 'нужна декомпозиция этой фичи', 'декампоз', 'разложи фичу на задачи', 'распили фичу на таски', 'раскидай это по задачам', 'разбей на подзадачи', 'нарежь задач по спеке', 'разбей фичу', 'порежь фичу на задачи', 'накидай тасков по этой фиче', 'набросай задач для этой фичи', 'распиши это по задачам', 'разбей эпик на куски', 'раздели на этапы', 'составь список задач по спеке', 'заведи несколько задач по доке'];
const other = ['что такое декомпозиция', 'как декомпозировать фичу?', 'не декомпозируй пока', 'не надо разбивать на задачи', 'покажи задачи', 'разбей текст на абзацы', 'раздели счёт на троих', 'распиши задачу подробнее', 'разбери задачу', 'создай задачу про логин', 'а почему декомпозиция плохая', 'закрой задачи', '«декомпозируй» — это слово'];
for (const s of asks) {
  assert(decomposeRequest(s), 'not recognised: ' + s);
  assert(isJiraCommand(s), 'not a Jira command: ' + s);
  // Leaves the chat model and goes to the planner (converse → plan → workspace).
  assert(actionRequest(s.replace(/^Петя,\s*/u, '')), 'stays in chat: ' + s);
}
for (const s of other) assert(!decomposeRequest(s), 'mistaken for decomposition: ' + s);
// A paraphrase the rules miss is restated by the tool router into a form the gate takes.
assert.equal(restate('jira-decompose', 'декомпозируй эту фичу', 'покрамсай фичу, чтобы команде было что делать'), 'декомпозируй эту фичу');
assert.equal(restate('jira-decompose', 'что такое декомпозиция', 'а что это вообще'), null);
console.log(`Decompose requests: ${asks.length} wordings recognised, ${other.length} look-alikes left alone`);
