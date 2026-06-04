import { describe, it, expect } from 'vitest';
import { createChatEngine } from '../chatEngineFactory.js';
import { ChatService } from '../chatService.js';
import { CliChatEngine } from '../cliChatEngine.js';

describe('createChatEngine', () => {
  it("returns a ChatService instance for the 'sdk' mode", () => {
    const engine = createChatEngine('sdk', { workingDirectory: '/tmp', permissionMode: 'default' });
    expect(engine).toBeInstanceOf(ChatService);
  });

  it("exposes the ChatEngine external surface for the 'sdk' engine", () => {
    const engine = createChatEngine('sdk', {});
    // The four members the two conversation call sites actually depend on.
    expect(typeof engine.sendMessageWithCallbacks).toBe('function');
    expect(typeof engine.setPermissionMode).toBe('function');
    expect(typeof engine.getPermissionMode).toBe('function');
    expect(engine.rewindWarning).toBeNull();
  });

  it("forwards config to the 'sdk' engine (permission mode reflected)", () => {
    const engine = createChatEngine('sdk', { permissionMode: 'bypassPermissions' });
    expect(engine.getPermissionMode()).toBe('bypassPermissions');
  });

  it("returns a CliChatEngine instance for the 'cli' mode (Story 32.4)", () => {
    const engine = createChatEngine('cli', { workingDirectory: '/tmp', permissionMode: 'default' });
    expect(engine).toBeInstanceOf(CliChatEngine);
  });

  it("exposes the ChatEngine external surface for the 'cli' engine", () => {
    const engine = createChatEngine('cli', {});
    expect(typeof engine.sendMessageWithCallbacks).toBe('function');
    expect(typeof engine.setPermissionMode).toBe('function');
    expect(typeof engine.getPermissionMode).toBe('function');
    expect(engine.rewindWarning).toBeNull();
  });

  it("forwards config to the 'cli' engine (permission mode reflected)", () => {
    const engine = createChatEngine('cli', { permissionMode: 'bypassPermissions' });
    expect(engine.getPermissionMode()).toBe('bypassPermissions');
  });
});
