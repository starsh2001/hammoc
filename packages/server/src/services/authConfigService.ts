import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  AuthConfig,
  AuthConfigError,
  MIN_PASSWORD_LENGTH,
  PasswordValidationResult,
} from '@hammoc/shared';

const HAMMOC_DIR = '.hammoc';
const CONFIG_FILE = 'config.json';
const BCRYPT_ROUNDS = 10;

/**
 * 패스워드 설정 관리 서비스
 * @description ~/.hammoc/config.json 파일을 통해 패스워드를 관리
 */
export class AuthConfigService {
  /**
   * 설정 파일 경로 반환
   */
  getConfigPath(): string {
    return path.join(os.homedir(), HAMMOC_DIR, CONFIG_FILE);
  }

  /**
   * 설정 디렉토리가 없으면 생성
   */
  ensureConfigDirectory(): void {
    const configDir = path.join(os.homedir(), HAMMOC_DIR);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * 패스워드가 설정되어 있는지 확인
   */
  isPasswordConfigured(): boolean {
    const configPath = this.getConfigPath();
    if (!fs.existsSync(configPath)) {
      return false;
    }

    try {
      const config = this.getConfig();
      return config !== null && !!config.passwordHash;
    } catch {
      return false;
    }
  }

  /**
   * 패스워드 유효성 검증
   */
  validatePassword(password: string): PasswordValidationResult {
    if (!password || password.length === 0) {
      return {
        valid: false,
        error: 'PASSWORD_EMPTY',
      };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        error: 'PASSWORD_TOO_SHORT',
      };
    }

    return { valid: true };
  }

  /**
   * 패스워드 설정 (최초 설정)
   * 세션 시크릿도 함께 생성
   */
  async setPassword(password: string): Promise<void> {
    const validation = this.validatePassword(password);
    if (!validation.valid) {
      throw new AuthConfigError(validation.error as 'PASSWORD_EMPTY' | 'PASSWORD_TOO_SHORT');
    }

    this.ensureConfigDirectory();

    const existingConfig = this.getConfig();
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    // Preserve existing session secret if server already generated one via getSessionSecret()
    const sessionSecret = existingConfig?.sessionSecret || crypto.randomBytes(32).toString('hex');

    const config: AuthConfig = {
      passwordHash: hash,
      createdAt: now,
      updatedAt: now,
      sessionSecret,
      secretVersion: existingConfig?.secretVersion || 1,
    };

    fs.writeFileSync(this.getConfigPath(), JSON.stringify(config, null, 2));
  }

  /**
   * 패스워드 검증
   */
  async verifyPassword(password: string): Promise<boolean> {
    const config = this.getConfig();
    if (!config) {
      return false;
    }

    return bcrypt.compare(password, config.passwordHash);
  }

  /**
   * 패스워드 재설정 (패스워드 변경)
   * 패스워드 변경 시 세션 시크릿도 함께 갱신하여 모든 기존 세션을 무효화
   * [Source: Story 2.4 - Task 3]
   * @returns requireRestart: true (서버 재시작 필요)
   */
  async resetPassword(newPassword: string): Promise<{ requireRestart: boolean }> {
    const validation = this.validatePassword(newPassword);
    if (!validation.valid) {
      throw new AuthConfigError(validation.error as 'PASSWORD_EMPTY' | 'PASSWORD_TOO_SHORT');
    }

    const existingConfig = this.getConfig();
    if (!existingConfig) {
      throw new AuthConfigError('CONFIG_NOT_FOUND');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date().toISOString();
    const newSecret = crypto.randomBytes(32).toString('hex');

    // Atomically save password and session secret together
    const config: AuthConfig = {
      passwordHash: hash,
      createdAt: existingConfig.createdAt,
      updatedAt: now,
      sessionSecret: newSecret,
      secretVersion: (existingConfig.secretVersion || 1) + 1,
    };

    fs.writeFileSync(this.getConfigPath(), JSON.stringify(config, null, 2));

    return { requireRestart: true };
  }

  /**
   * 세션 시크릿 조회 (없으면 생성)
   * [Source: Story 2.4 - Task 2]
   */
  async getSessionSecret(): Promise<string> {
    const config = this.getConfig();

    if (config?.sessionSecret) {
      return config.sessionSecret;
    }

    // Generate new secret if not exists
    const secret = crypto.randomBytes(32).toString('hex');
    this.ensureConfigDirectory();

    const newConfig: AuthConfig = {
      ...config,
      passwordHash: config?.passwordHash || '',
      createdAt: config?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionSecret: secret,
      secretVersion: 1,
    };

    fs.writeFileSync(this.getConfigPath(), JSON.stringify(newConfig, null, 2));
    return secret;
  }

  /**
   * 세션 시크릿 갱신 (모든 세션 무효화)
   * [Source: Story 2.4 - Task 3]
   */
  async rotateSessionSecret(): Promise<string> {
    const config = this.getConfig();
    if (!config) {
      throw new AuthConfigError('CONFIG_NOT_FOUND');
    }

    const newSecret = crypto.randomBytes(32).toString('hex');

    const updatedConfig: AuthConfig = {
      ...config,
      sessionSecret: newSecret,
      secretVersion: (config.secretVersion || 1) + 1,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(this.getConfigPath(), JSON.stringify(updatedConfig, null, 2));
    return newSecret;
  }

  /**
   * 설정 파일 읽기
   */
  getConfig(): AuthConfig | null {
    const configPath = this.getConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as AuthConfig;
    } catch {
      return null;
    }
  }
}
