import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLIStatusResponse, DEFAULT_SETUP_COMMANDS } from '@hammoc/shared';

const execAsync = promisify(exec);

// Timeout setting (5 seconds)
const CLI_TIMEOUT = 5000;

// Resolve a known-good shell on Windows (full path, works from any parent shell)
function getWin32Shell(): string {
  if (process.env.COMSPEC) return process.env.COMSPEC;
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'cmd.exe');
}

/**
 * Resolve the absolute path of the `claude` executable once at startup.
 * Caches the result so subsequent checks don't depend on PATH at all.
 */
let resolvedClaudePath: string | null = null;

function resolveClaudePath(): string | null {
  if (resolvedClaudePath !== null) return resolvedClaudePath;

  const isWin = process.platform === 'win32';

  // 1) Try `where` (Windows) / `which` (Unix) via a known-good shell
  try {
    const cmd = isWin ? 'where claude' : 'which claude';
    const shell = isWin ? getWin32Shell() : undefined;
    const result = execSync(cmd, { timeout: CLI_TIMEOUT, ...(shell && { shell }), encoding: 'utf-8' });
    const firstLine = result.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      resolvedClaudePath = firstLine;
      console.log('[cliService] Resolved claude path:', resolvedClaudePath);
      return resolvedClaudePath;
    }
  } catch { /* not in PATH */ }

  // 2) Check common npm global locations
  const candidates: string[] = [];
  if (isWin) {
    const appData = process.env.APPDATA;
    if (appData) candidates.push(path.join(appData, 'npm', 'claude.cmd'));
    // npm prefix based on current node location
    const nodeDir = path.dirname(process.execPath);
    candidates.push(path.join(nodeDir, 'claude.cmd'));
  } else {
    candidates.push('/usr/local/bin/claude', '/usr/bin/claude');
    // npm global bin from node location
    const nodeDir = path.dirname(process.execPath);
    candidates.push(path.join(nodeDir, 'claude'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      resolvedClaudePath = candidate;
      console.log('[cliService] Resolved claude path (candidate):', resolvedClaudePath);
      return resolvedClaudePath;
    }
  }

  console.warn('[cliService] Could not resolve claude executable path');
  resolvedClaudePath = ''; // empty = not found, but don't retry every time
  return null;
}

/**
 * Service for checking Claude CLI installation and authentication status
 */
export class CliService {
  /**
   * Check if Claude CLI is installed
   * @returns true if CLI is installed, false otherwise
   */
  async checkCliInstalled(): Promise<boolean> {
    const claudePath = resolveClaudePath();
    if (!claudePath) return false;

    try {
      const shell = process.platform === 'win32' ? getWin32Shell() : undefined;
      await execAsync(`"${claudePath}" --version`, { timeout: CLI_TIMEOUT, ...(shell && { shell }) });
      return true;
    } catch {
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

      // Always check authentication (filesystem check) independently of CLI PATH status.
      // CLI may not be in PATH but credentials can still exist.
      response.authenticated = await this.checkAuthentication();

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
