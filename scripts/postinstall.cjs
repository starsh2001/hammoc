#!/usr/bin/env node
'use strict';

// Link @hammoc/shared into node_modules after npm install.
// In workspace (development) mode, npm handles this via symlinks.
// In global/standalone install, we need to create the link manually
// so the server can resolve `import ... from '@hammoc/shared'`.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sharedPkg = path.resolve(root, 'packages', 'shared');
const nmScope = path.resolve(root, 'node_modules', '@hammoc');
const nmTarget = path.resolve(nmScope, 'shared');

// Only create link if shared package exists in tarball but not in node_modules
if (fs.existsSync(sharedPkg) && !fs.existsSync(nmTarget)) {
  fs.mkdirSync(nmScope, { recursive: true });
  // Use junction on Windows (no admin privileges needed), symlink on Unix
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(sharedPkg, nmTarget, type);
}
