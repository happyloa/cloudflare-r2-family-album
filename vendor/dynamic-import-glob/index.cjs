const { globSync } = require('tinyglobby');

// vite-plugin-dynamic-import only uses fast-glob.sync(patterns, { cwd }).
// Keep fast-glob's directory behavior when using tinyglobby.
exports.sync = (patterns, options) =>
  globSync(patterns, { ...options, expandDirectories: false });
