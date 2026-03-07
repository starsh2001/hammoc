import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChatService } from '../chatService.js';
import os from 'os';
import path from 'path';

/**
 * Integration tests for ChatService
 *
 * These tests interact with the actual Claude Code CLI.
 * They are skipped by default in CI environments.
 *
 * To run these tests locally:
 * 1. Ensure Claude Code CLI is installed and authenticated (`claude login`)
 * 2. Run: npm run test:integration
 *
 * To skip these tests:
 * Set SKIP_INTEGRATION_TESTS=true environment variable
 */

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('ChatService Integration Tests', () => {
  let service: ChatService;
  const testDir = os.tmpdir();

  beforeAll(async () => {
    service = new ChatService();
    await service.initSession(testDir);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Session Initialization', () => {
    it('should initialize session with valid directory', async () => {
      const newService = new ChatService();
      await newService.initSession(testDir);
      expect(newService.getWorkingDirectory()).toBe(path.resolve(testDir));
    });

    it('should reject invalid directory', async () => {
      const newService = new ChatService();
      await expect(
        newService.initSession('/non/existent/directory/path/12345')
      ).rejects.toThrow();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid path gracefully', async () => {
      const newService = new ChatService();
      try {
        await newService.initSession('/invalid/path/that/does/not/exist');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Tool Configuration', () => {
    it('should accept allowed tools configuration', () => {
      const tools = ['Read', 'Edit', 'Write'];
      service.setAllowedTools(tools);
      // Verify no errors are thrown
      expect(service.getWorkingDirectory()).toBeDefined();
    });

    it('should accept disallowed tools configuration', () => {
      const tools = ['Bash'];
      service.setDisallowedTools(tools);
      // Verify no errors are thrown
      expect(service.getWorkingDirectory()).toBeDefined();
    });
  });
});

/**
 * Note: Actual message sending tests require:
 * 1. Claude Code CLI to be installed
 * 2. Valid authentication (claude login)
 * 3. Network connectivity to Anthropic API
 *
 * These tests are intentionally commented out to avoid
 * accidental API calls and costs during development.
 *
 * Uncomment and modify as needed for manual testing:
 *
 * describe.skipIf(SKIP_INTEGRATION)('Message Sending', () => {
 *   it('should send a simple message and receive response', async () => {
 *     const response = await service.sendMessageSync('Hello, say "test" only.');
 *     expect(response.done).toBe(true);
 *     expect(response.content).toBeDefined();
 *   }, 30000); // Extended timeout for API call
 *
 *   it('should handle streaming messages', async () => {
 *     const messages: SDKMessage[] = [];
 *     const generator = service.sendMessage('Say "hello"');
 *
 *     for await (const message of generator) {
 *       messages.push(message);
 *     }
 *
 *     expect(messages.length).toBeGreaterThan(0);
 *   }, 30000);
 * });
 */
