#!/usr/bin/env node

// Hammoc CLI entry point
// Usage: hammoc [options]
//   --port <number>   Port to listen on (default: 3000)
//   --host <string>   Host to bind to (default: 0.0.0.0)
//   --reset-password  Reset the admin password
//   --help            Show this help message

import { fileURLToPath, pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Hammoc - Claude Code Session Manager

  Usage: hammoc [options]

  Options:
    --port <number>        Port to listen on (default: 3000, env: PORT)
    --host <string>        Host to bind to (default: 0.0.0.0, env: HOST)
    --trust-proxy          Enable reverse proxy support (env: TRUST_PROXY)
    --cors-origin <url>    Restrict CORS to specific origin (env: CORS_ORIGIN)
    --rate-limit <number>  Requests per minute per IP (default: 200, env: RATE_LIMIT)
    --reset-password       Reset the admin password
    -h, --help             Show this help message
    -v, --version          Show version number
  `);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkgPath = path.resolve(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  console.log(pkg.version);
  process.exit(0);
}

// Map CLI args to environment variables (before importing server)
const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  process.env.PORT = args[portIndex + 1];
}

const hostIndex = args.indexOf('--host');
if (hostIndex !== -1 && args[hostIndex + 1]) {
  process.env.HOST = args[hostIndex + 1];
}

if (args.includes('--trust-proxy')) {
  process.env.TRUST_PROXY = 'true';
}

const corsIndex = args.indexOf('--cors-origin');
if (corsIndex !== -1 && args[corsIndex + 1]) {
  process.env.CORS_ORIGIN = args[corsIndex + 1];
}

const rateLimitIndex = args.indexOf('--rate-limit');
if (rateLimitIndex !== -1 && args[rateLimitIndex + 1]) {
  process.env.RATE_LIMIT = args[rateLimitIndex + 1];
}

// Always run in production mode
process.env.NODE_ENV = 'production';

// Ensure @hammoc/shared is resolvable (postinstall may be skipped by npx)
import { existsSync, mkdirSync, symlinkSync } from 'fs';
const root = path.resolve(__dirname, '..');
const sharedPkg = path.resolve(root, 'packages', 'shared');
const nmScope = path.resolve(root, 'node_modules', '@hammoc');
const nmTarget = path.resolve(nmScope, 'shared');
if (existsSync(sharedPkg) && !existsSync(nmTarget)) {
  mkdirSync(nmScope, { recursive: true });
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(sharedPkg, nmTarget, type);
}

// Start the server
const serverEntry = path.resolve(__dirname, '..', 'packages', 'server', 'dist', 'index.js');
await import(pathToFileURL(serverEntry).href);
