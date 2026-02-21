// Dev entry point - sets environment before importing main server
// Must use dynamic import because ES module static imports are hoisted
// and would run before env vars are set
process.env.NODE_ENV = 'development';
process.env.PORT = '3001';

await import('./index.js');

export {};
