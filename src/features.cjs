// Feature modules: each declares its setting defaults and validation and registers its services and
// IPC handlers through the shared services object. Add a feature here instead of editing main.cjs.
module.exports=[
 require('./features/window-state.cjs'),
 require('./features/clarifications.cjs'),
 require('./features/extension-ui.cjs'),
 ...require('./features/extension-ui.cjs').features,
 require('./features/slack-screen.cjs'),
 require('./features/context-discovery.cjs'),
 require('./features/meeting-memory.cjs'),
 require('./features/chat-return.cjs'),
 require('./features/chat-library.cjs'),
 require('./features/agents.cjs'),
 require('./features/highlights.cjs'),
 require('./features/extension-replies.cjs'),
 require('./features/chat-results.cjs'),
 require('./features/chat-changes.cjs')
];
