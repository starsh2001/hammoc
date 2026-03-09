import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthConfig,
  AuthConfigError,
  MIN_PASSWORD_LENGTH,
} from '@hammoc/shared';

// Mutable mock state - must be a simple object without const values in vi.mock
const mockState = {
  existsSync: false,
  readFileSync: '',
  writeFileCalled: false,
  writeFileContent: '',
  mkdirCalled: false,
  bcryptCompareResult: true,
};

// Mock modules before imports
vi.mock('node:os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('node:fs', () => ({
  existsSync: () => mockState.existsSync,
  readFileSync: () => mockState.readFileSync,
  writeFileSync: (_path: string, content: string) => {
    mockState.writeFileCalled = true;
    mockState.writeFileContent = content;
  },
  mkdirSync: () => {
    mockState.mkdirCalled = true;
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$10$mockedhashvalue'),
    compare: vi.fn().mockImplementation(() => Promise.resolve(mockState.bcryptCompareResult)),
  },
}));

// Import after mocks
import { AuthConfigService } from '../authConfigService.js';

describe('AuthConfigService', () => {
  let service: AuthConfigService;

  const mockHashedPassword = '$2b$10$mockedhashvalue';
  const mockConfig: AuthConfig = {
    passwordHash: mockHashedPassword,
    createdAt: '2026-01-31T12:00:00.000Z',
    updatedAt: '2026-01-31T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthConfigService();

    // Reset mock state
    mockState.existsSync = false;
    mockState.readFileSync = '';
    mockState.writeFileCalled = false;
    mockState.writeFileContent = '';
    mockState.mkdirCalled = false;
    mockState.bcryptCompareResult = true;
  });

  describe('getConfigPath', () => {
    it('should return correct config path', () => {
      const result = service.getConfigPath();
      expect(result).toContain('.hammoc');
      expect(result).toContain('config.json');
    });
  });

  describe('ensureConfigDirectory', () => {
    it('should create directory if it does not exist', () => {
      mockState.existsSync = false;
      service.ensureConfigDirectory();
      expect(mockState.mkdirCalled).toBe(true);
    });

    it('should not create directory if it exists', () => {
      mockState.existsSync = true;
      service.ensureConfigDirectory();
      expect(mockState.mkdirCalled).toBe(false);
    });
  });

  describe('isPasswordConfigured', () => {
    it('should return false when config file does not exist', () => {
      mockState.existsSync = false;
      const result = service.isPasswordConfigured();
      expect(result).toBe(false);
    });

    it('should return true when config file exists with passwordHash', () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);
      const result = service.isPasswordConfigured();
      expect(result).toBe(true);
    });

    it('should return false when config file exists but passwordHash is empty', () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify({ ...mockConfig, passwordHash: '' });
      const result = service.isPasswordConfigured();
      expect(result).toBe(false);
    });

    it('should return false when config file is invalid JSON', () => {
      mockState.existsSync = true;
      mockState.readFileSync = 'invalid json';
      const result = service.isPasswordConfigured();
      expect(result).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should return valid for password with 4 or more characters', () => {
      const result = service.validatePassword('pass');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return valid for password with more than 4 characters', () => {
      const result = service.validatePassword('password123');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for password shorter than 4 characters', () => {
      const result = service.validatePassword('abc');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('PASSWORD_TOO_SHORT');
    });

    it('should return invalid for empty string', () => {
      const result = service.validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('PASSWORD_EMPTY');
    });

    it('should respect MIN_PASSWORD_LENGTH constant', () => {
      const shortPassword = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
      const validPassword = 'a'.repeat(MIN_PASSWORD_LENGTH);

      expect(service.validatePassword(shortPassword).valid).toBe(false);
      expect(service.validatePassword(validPassword).valid).toBe(true);
    });
  });

  describe('setPassword', () => {
    it('should hash and save password successfully', async () => {
      mockState.existsSync = false;

      await service.setPassword('password123');

      expect(mockState.mkdirCalled).toBe(true);
      expect(mockState.writeFileCalled).toBe(true);

      const savedConfig = JSON.parse(mockState.writeFileContent);
      expect(savedConfig.passwordHash).toBe(mockHashedPassword);
      expect(savedConfig.createdAt).toBeDefined();
      expect(savedConfig.updatedAt).toBeDefined();
    });

    it('should throw error for password too short', async () => {
      await expect(service.setPassword('abc')).rejects.toThrow(AuthConfigError);
      await expect(service.setPassword('abc')).rejects.toThrow(
        '패스워드는 최소 4자 이상이어야 합니다.'
      );
    });

    it('should throw error for empty password', async () => {
      await expect(service.setPassword('')).rejects.toThrow(AuthConfigError);
      await expect(service.setPassword('')).rejects.toThrow(
        '패스워드를 입력해주세요.'
      );
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);
      mockState.bcryptCompareResult = true;

      const result = await service.verifyPassword('password123');
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);
      mockState.bcryptCompareResult = false;

      const result = await service.verifyPassword('wrongpassword');
      expect(result).toBe(false);
    });

    it('should return false when config does not exist', async () => {
      mockState.existsSync = false;

      const result = await service.verifyPassword('password123');
      expect(result).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);

      await service.resetPassword('newpassword');

      expect(mockState.writeFileCalled).toBe(true);

      const savedConfig = JSON.parse(mockState.writeFileContent);
      expect(savedConfig.passwordHash).toBe(mockHashedPassword);
      expect(savedConfig.createdAt).toBe(mockConfig.createdAt);
      expect(savedConfig.updatedAt).not.toBe(mockConfig.updatedAt);
    });

    it('should throw error when config does not exist', async () => {
      mockState.existsSync = false;

      await expect(service.resetPassword('newpassword')).rejects.toThrow(
        AuthConfigError
      );
      await expect(service.resetPassword('newpassword')).rejects.toThrow(
        '설정 파일을 찾을 수 없습니다.'
      );
    });

    it('should throw error for invalid new password', async () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);

      await expect(service.resetPassword('abc')).rejects.toThrow(AuthConfigError);
    });
  });

  describe('getConfig', () => {
    it('should return config when file exists', () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);

      const result = service.getConfig();
      expect(result).toEqual(mockConfig);
    });

    it('should return null when file does not exist', () => {
      mockState.existsSync = false;

      const result = service.getConfig();
      expect(result).toBeNull();
    });

    it('should return null when file is invalid JSON', () => {
      mockState.existsSync = true;
      mockState.readFileSync = 'invalid json';

      const result = service.getConfig();
      expect(result).toBeNull();
    });
  });

  // Story 2.4 - Session Secret Tests
  describe('getSessionSecret', () => {
    it('[HIGH] should return existing session secret when present', async () => {
      const configWithSecret = {
        ...mockConfig,
        sessionSecret: 'existing-secret-key',
        secretVersion: 1,
      };
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(configWithSecret);

      const result = await service.getSessionSecret();
      expect(result).toBe('existing-secret-key');
    });

    it('[HIGH] should generate and save new secret when not present', async () => {
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(mockConfig);

      const result = await service.getSessionSecret();

      expect(result).toBeDefined();
      expect(result.length).toBe(64); // 32 bytes = 64 hex chars
      expect(mockState.writeFileCalled).toBe(true);

      const savedConfig = JSON.parse(mockState.writeFileContent);
      expect(savedConfig.sessionSecret).toBe(result);
      expect(savedConfig.secretVersion).toBe(1);
    });
  });

  describe('rotateSessionSecret', () => {
    it('[HIGH] should generate new secret and increment version', async () => {
      const configWithSecret = {
        ...mockConfig,
        sessionSecret: 'old-secret',
        secretVersion: 1,
      };
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(configWithSecret);

      const result = await service.rotateSessionSecret();

      expect(result).toBeDefined();
      expect(result.length).toBe(64);
      expect(result).not.toBe('old-secret');
      expect(mockState.writeFileCalled).toBe(true);

      const savedConfig = JSON.parse(mockState.writeFileContent);
      expect(savedConfig.sessionSecret).toBe(result);
      expect(savedConfig.secretVersion).toBe(2);
    });

    it('[HIGH] should throw error when config does not exist', async () => {
      mockState.existsSync = false;

      await expect(service.rotateSessionSecret()).rejects.toThrow(
        AuthConfigError
      );
    });
  });

  describe('resetPassword with session invalidation', () => {
    it('[HIGH] should regenerate session secret when password is reset', async () => {
      const configWithSecret = {
        ...mockConfig,
        sessionSecret: 'old-secret',
        secretVersion: 1,
      };
      mockState.existsSync = true;
      mockState.readFileSync = JSON.stringify(configWithSecret);

      const result = await service.resetPassword('newpassword');

      expect(result.requireRestart).toBe(true);
      expect(mockState.writeFileCalled).toBe(true);

      const savedConfig = JSON.parse(mockState.writeFileContent);
      expect(savedConfig.sessionSecret).not.toBe('old-secret');
      expect(savedConfig.sessionSecret.length).toBe(64);
      expect(savedConfig.secretVersion).toBe(2);
    });
  });
});
