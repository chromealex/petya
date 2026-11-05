// Feature modules: each declares its setting defaults and validation and registers its services and
// IPC handlers through the shared services object. Add a feature here instead of editing main.cjs.
module.exports=[
 require('./features/chat-return.cjs'),
 require('./features/chat-library.cjs'),
 require('./features/agents.cjs'),
 require('./features/highlights.cjs'),
 require('./features/address.cjs'),
 require('./features/chat-tasks.cjs'),
 require('./features/fresh-data.cjs'),
 require('./features/list-followup.cjs'),
 require('./features/selftest.cjs'),
 require('./features/morning-brief.cjs'),
 require('./features/extension-replies.cjs')
];
