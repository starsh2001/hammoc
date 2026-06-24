import { Router, Request, Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.js';

const log = createLogger('config-routes');
const router = Router();

const HAMMOC_DIR = '.hammoc';
const CONFIG_FILE = 'config.json';

function getConfigPath(): string {
  return path.join(os.homedir(), HAMMOC_DIR, CONFIG_FILE);
}

function ensureConfigDirectory(): void {
  const configDir = path.join(os.homedir(), HAMMOC_DIR);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

function readConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>): void {
  ensureConfigDirectory();
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

/**
 * POST /api/config/api-key
 * Persist Anthropic API key to ~/.hammoc/config.json and load into process.env
 */
router.post('/api-key', (req: Request, res: Response): void => {
  const { apiKey } = req.body as { apiKey?: string };

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  const trimmed = apiKey.trim();

  try {
    const config = readConfig();
    config.anthropicApiKey = trimmed;
    writeConfig(config);

    process.env.ANTHROPIC_API_KEY = trimmed;

    log.info('API key persisted and loaded into environment');
    res.json({ success: true });
  } catch (err) {
    log.error('Failed to save API key', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

export default router;
