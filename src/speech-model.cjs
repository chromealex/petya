const fs = require('node:fs'), path = require('node:path');
function bundledModel(roots, exists = fs.existsSync) {
  for (const root of roots) {
    for (const name of ['ggml-small.bin', 'ggml-base.bin']) {
      const model = path.join(root, 'runtime/models', name);
      if (exists(model)) return model;
    }
  }
  return '';
}
function upgradeBundledModel(current, selected, roots) {
  if (!selected || path.basename(selected) !== 'ggml-small.bin') return current;
  return roots.some(root => current === path.join(root, 'runtime/models/ggml-base.bin')) ? selected : current;
}
module.exports = { bundledModel, upgradeBundledModel };
