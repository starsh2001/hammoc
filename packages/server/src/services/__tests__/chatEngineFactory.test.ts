import { describe, it, expect } from 'vitest';
import { createChatEngine } from '../chatEngineFactory.js';
import { ChatService } from '../chatService.js';

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

  it("throws a clear not-implemented error for the 'cli' mode", () => {
    expect(() => createChatEngine('cli', {})).toThrow(/CLI engine not implemented/i);
  });
});
