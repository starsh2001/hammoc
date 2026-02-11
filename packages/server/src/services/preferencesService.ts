/**
 * Preferences Service
 * Manages global user preferences stored at ~/.bmad-studio/preferences.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { UserPreferences } from '@bmad-studio/shared';

class PreferencesService {
  private getDataDir(): string {
    return path.join(os.homedir(), '.bmad-studio');
  }

  private getPreferencesPath(): string {
    return path.join(this.getDataDir(), 'preferences.json');
  }

  async readPreferences(): Promise<UserPreferences> {
    try {
      const content = await fs.readFile(this.getPreferencesPath(), 'utf-8');
      return JSON.parse(content) as UserPreferences;
    } catch {
      return {};
    }
  }

  async writePreferences(partial: Partial<UserPreferences>): Promise<UserPreferences> {
    const dataDir = this.getDataDir();
    await fs.mkdir(dataDir, { recursive: true });

    const existing = await this.readPreferences();
    const merged = { ...existing, ...partial };
    await fs.writeFile(this.getPreferencesPath(), JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  }
}

export const preferencesService = new PreferencesService();
