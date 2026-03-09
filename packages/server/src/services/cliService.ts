import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLIStatusResponse, DEFAULT_SETUP_COMMANDS } from '@hammoc/shared';

const execAsync = promisify(exec);

// Timeout setting (5 seconds)
const CLI_TIMEOUT = 5000;

/**
 * Service for checking Claude CLI installation and authentication status
 */
export class CliService {
  /**
   * Check if Claude CLI is installed
   * @returns true if CLI is installed, false otherwise
   */
  async checkCliInstalled(): Promise<boolean> {
    try {
      await execAsync('claude --version', { timeout: CLI_TIMEOUT });
      return true;
    } catch (error: unknown) {
      // ENOENT means CLI is not found in PATH
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return false;
      }
      // Command execution failed (e.g., timeout, other errors)
      // Treat as not installed if we can't verify
      return false;
    }
  }

  /**
   * Check if user is authenticated with Claude
   * Uses file system check for credentials directory
   * @returns true if credentials exist, false otherwise
   */
  async checkAuthentication(): Promise<boolean> {
    try {
      const credentialsPath = path.join(os.homedir(), '.claude');
      const exists = fs.existsSync(credentialsPath);
      if (!exists) {
        return false;
      }
      const files = fs.readdirSync(credentialsPath);
      return files.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if ANTHROPIC_API_KEY environment variable is set
   * @returns true if API key is set, false otherwise
   */
  async checkApiKey(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Get complete CLI status including installation, authentication, and API key status
   * @returns CLIStatusResponse with all status fields
   */
  async getStatus(): Promise<CLIStatusResponse> {
    const response: CLIStatusResponse = {
      cliInstalled: false,
      authenticated: false,
      apiKeySet: false,
      setupCommands: { ...DEFAULT_SETUP_COMMANDS },
    };

    try {
      response.cliInstalled = await this.checkCliInstalled();

      // Only check authentication if CLI is installed
      if (response.cliInstalled) {
        response.authenticated = await this.checkAuthentication();
      }

      // API key can be checked regardless of CLI installation
      response.apiKeySet = await this.checkApiKey();

      return response;
    } catch (error: unknown) {
      // Handle timeout or other execution errors
      const errorMessage =
        error instanceof Error &&
        'killed' in error &&
        (error as NodeJS.ErrnoException & { killed?: boolean }).killed
          ? 'CLI 상태 확인 시간 초과. 잠시 후 다시 시도해주세요.'
          : 'CLI 상태 확인 중 오류가 발생했습니다.';

      return {
        cliInstalled: false,
        authenticated: false,
        apiKeySet: !!process.env.ANTHROPIC_API_KEY,
        setupCommands: { ...DEFAULT_SETUP_COMMANDS },
        error: errorMessage,
      };
    }
  }
}

// Export singleton instance
export const cliService = new CliService();
