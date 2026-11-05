// Feature modules: each declares its setting defaults and validation and registers its services and
// IPC handlers through the shared services object. Add a feature here instead of editing main.cjs.
module.exports=[
 require('./features/artist.cjs'),
 require('./features/context-discovery.cjs'),
 require('./features/unity.cjs'),
 require('./features/layout.cjs'),
 require('./features/chat-return.cjs'),
 require('./features/chat-library.cjs'),
 require('./features/agents.cjs'),
 require('./features/highlights.cjs'),
 require('./features/blender-motion.cjs'),
 require('./features/extension-replies.cjs'),
 require('./features/chat-results.cjs'),
 require('./features/chat-changes.cjs')
];
