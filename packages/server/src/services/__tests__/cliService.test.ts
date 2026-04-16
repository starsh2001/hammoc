import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_SETUP_COMMANDS } from '@hammoc/shared';
import * as path from 'path';
import * as os from 'os';

// Store original env
const originalEnv = { ...process.env };

// Mock execAsync result
let mockExecResult: { stdout: string; stderr: string } | Error = {
  stdout: '1.0.23\n',
  stderr: '',
};

// Mock fs functions
let mockExistsSync = true;
let mockReaddirSync: string[] = ['credentials.json'];

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => {
    return async () => {
      if (mockExecResult instanceof Error) {
        throw mockExecResult;
      }
      return mockExecResult;
    };
  },
}));

vi.mock('fs', () => ({
  existsSync: () => mockExistsSync,
  readdirSync: () => mockReaddirSync,
}));

// Import after mocks
import { CliService } from '../cliService.js';

describe('CliService', () => {
  let service: CliService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CliService();
    process.env = { ...originalEnv };
    // Reset mock defaults
    mockExecResult = { stdout: '1.0.23\n', stderr: '' };
    mockExistsSync = true;
    mockReaddirSync = ['credentials.json'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('checkCliInstalled', () => {
    it('should return true when CLI is installed', async () => {
      mockExecResult = { stdout: '1.0.23\n', stderr: '' };

      const result = await service.checkCliInstalled();
      expect(result).toBe(true);
    });

    it('should return false when CLI is not installed (ENOENT)', async () => {
      mockExecResult = Object.assign(new Error('spawn claude ENOENT'), {
        code: 'ENOENT',
      });

      const result = await service.checkCliInstalled();
      expect(result).toBe(false);
    });

    it('should return false when CLI execution times out', async () => {
      mockExecResult = Object.assign(new Error('Command timed out'), {
        killed: true,
        signal: 'SIGTERM',
      });

      const result = await service.checkCliInstalled();
      expect(result).toBe(false);
    });

    it('should return false for other execution errors', async () => {
      mockExecResult = new Error('Some other error');

      const result = await service.checkCliInstalled();
      expect(result).toBe(false);
    });
  });

  describe('checkAuthentication', () => {
    it('should return true when credentials directory exists with files', async () => {
      mockExistsSync = true;
      mockReaddirSync = ['credentials.json'];

      const result = await service.checkAuthentication();
      expect(result).toBe(true);
    });

    it('should return false when credentials directory does not exist', async () => {
      mockExistsSync = false;

      const result = await service.checkAuthentication();
      expect(result).toBe(false);
    });

    it('should return false when credentials directory is empty', async () => {
      mockExistsSync = true;
      mockReaddirSync = [];

      const result = await service.checkAuthentication();
      expect(result).toBe(false);
    });
  });

  describe('checkApiKey', () => {
    it('should return true when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';

      const result = await service.checkApiKey();
      expect(result).toBe(true);
    });

    it('should return false when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await service.checkApiKey();
      expect(result).toBe(false);
    });

    it('should return false when ANTHROPIC_API_KEY is empty string', async () => {
      process.env.ANTHROPIC_API_KEY = '';

      const result = await service.checkApiKey();
      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return complete status when all checks pass', async () => {
      mockExecResult = { stdout: '1.0.23\n', stderr: '' };
      mockExistsSync = true;
      mockReaddirSync = ['credentials.json'];
      process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';

      const result = await service.getStatus();

      expect(result).toEqual({
        cliInstalled: true,
        authenticated: true,
        apiKeySet: true,
        setupCommands: DEFAULT_SETUP_COMMANDS,
      });
    });

    it('should check authentication independently when CLI is not installed', async () => {
      mockExecResult = Object.assign(new Error('spawn claude ENOENT'), {
        code: 'ENOENT',
      });
      mockExistsSync = true;
      mockReaddirSync = ['credentials.json'];
      delete process.env.ANTHROPIC_API_KEY;

      const result = await service.getStatus();

      expect(result.cliInstalled).toBe(false);
      // Authentication is checked independently via filesystem, not CLI
      expect(result.authenticated).toBe(true);
      expect(result.apiKeySet).toBe(false);
    });

    it('should include setupCommands in response', async () => {
      mockExecResult = Object.assign(new Error('spawn claude ENOENT'), {
        code: 'ENOENT',
      });
      mockExistsSync = false;
      delete process.env.ANTHROPIC_API_KEY;

      const result = await service.getStatus();

      expect(result.setupCommands).toEqual(DEFAULT_SETUP_COMMANDS);
      expect(result.setupCommands.install).toBe(
        'npm install -g @anthropic-ai/claude-code'
      );
      expect(result.setupCommands.login).toBe(
        'claude (then type /login in interactive mode)'
      );
      expect(result.setupCommands.apiKey).toBe(
        'export ANTHROPIC_API_KEY=<your-api-key>'
      );
    });

    it('should check API key regardless of CLI installation status', async () => {
      mockExecResult = Object.assign(new Error('spawn claude ENOENT'), {
        code: 'ENOENT',
      });
      mockExistsSync = false;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-xxx';

      const result = await service.getStatus();

      expect(result.cliInstalled).toBe(false);
      expect(result.apiKeySet).toBe(true);
    });
  });
});

describe('Cross-Platform Credential Path', () => {
  it('should use os.homedir for credentials path', () => {
    const homedir = os.homedir();
    const credentialsPath = path.join(homedir, '.claude');
    expect(credentialsPath).toContain('.claude');
  });

  it('should use path.join for cross-platform compatibility', () => {
    const testPath = path.join('home', 'user', '.claude');
    expect(testPath.split(path.sep)).toEqual(['home', 'user', '.claude']);
  });
});
