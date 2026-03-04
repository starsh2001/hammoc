import { Request, Response } from 'express';
import { exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: packages/server/src/controllers → ../../../..  (also works from dist/controllers)
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Detect dev mode: .git AND packages/server/src must both exist
const isDevMode = fs.existsSync(path.join(MONOREPO_ROOT, '.git'))
  && fs.existsSync(path.join(MONOREPO_ROOT, 'packages', 'server', 'src'));

// Read version from root package.json
function getPackageInfo(): { name: string; version: string } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MONOREPO_ROOT, 'package.json'), 'utf-8'));
    return { name: pkg.name || 'bmad-studio', version: pkg.version || '0.0.0' };
  } catch {
    return { name: 'bmad-studio', version: '0.0.0' };
  }
}

// In-memory build/update state
let buildState: { status: 'idle' | 'building' | 'updating' | 'failed'; error?: string } = { status: 'idle' };

function spawnAndExit(): void {
  let exitCancelled = false;

  const child = spawn('npm', ['run', 'start'], {
    cwd: MONOREPO_ROOT,
    detached: true,
    stdio: 'ignore',
    shell: true,
  });

  child.on('error', (err) => {
    exitCancelled = true;
    console.error('[server] Failed to spawn new process:', err.message);
    buildState = { status: 'failed', error: `Spawn failed: ${err.message}` };
  });

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      exitCancelled = true;
      console.error(`[server] New process exited immediately with code ${code}`);
      buildState = { status: 'failed', error: `New process exited with code ${code}` };
    }
  });

  child.unref();
  setTimeout(() => {
    if (exitCancelled) {
      console.log('[server] Not exiting — new process failed to start.');
      return;
    }
    console.log('[server] Exiting old server process.');
    process.exit(0);
  }, 3000);
}

export const serverController = {
  /** GET /api/server/info - server environment info */
  async info(_req: Request, res: Response): Promise<void> {
    const { name, version } = getPackageInfo();
    res.json({ isDevMode, version, packageName: name });
  },

  /** POST /api/server/restart - rebuild & restart (dev only) */
  async restart(req: Request, res: Response): Promise<void> {
    if (!isDevMode) {
      res.status(403).json({ error: { code: 'DEV_ONLY', message: req.t!('server.error.rebuildDevOnly') } });
      return;
    }
    if (buildState.status === 'building' || buildState.status === 'updating') {
      res.status(409).json({ error: { code: 'BUILD_IN_PROGRESS', message: req.t!('server.error.buildInProgress') } });
      return;
    }

    buildState = { status: 'building' };
    res.json({ message: req.t!('server.info.buildStarted') });

    exec('npm run build', { cwd: MONOREPO_ROOT, timeout: 300_000 }, (err, _stdout, stderr) => {
      if (err) {
        const errorMsg = stderr?.trim() || err.message;
        console.error('[restart] Build failed:', errorMsg);
        buildState = { status: 'failed', error: errorMsg };
        return;
      }
      console.log('[restart] Build complete. Spawning new server...');
      spawnAndExit();
    });
  },

  /** GET /api/server/check-update - check npm registry for newer version */
  async checkUpdate(req: Request, res: Response): Promise<void> {
    if (isDevMode) {
      res.status(501).json({ error: { code: 'NOT_APPLICABLE', message: req.t!('server.error.updateCheckDevOnly') } });
      return;
    }

    const { name, version: currentVersion } = getPackageInfo();
    exec(`npm view ${name} version`, { timeout: 30_000 }, (err, stdout) => {
      if (err) {
        res.status(502).json({ error: { code: 'REGISTRY_ERROR', message: req.t!('server.error.npmCheckFailed') } });
        return;
      }
      const latestVersion = stdout.trim();
      res.json({
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion !== currentVersion,
      });
    });
  },

  /** POST /api/server/update - npm update & restart (non-dev only) */
  async update(req: Request, res: Response): Promise<void> {
    if (isDevMode) {
      res.status(403).json({ error: { code: 'DEV_ONLY', message: req.t!('server.error.useRebuildInDev') } });
      return;
    }
    if (buildState.status === 'building' || buildState.status === 'updating') {
      res.status(409).json({ error: { code: 'UPDATE_IN_PROGRESS', message: req.t!('server.error.operationInProgress') } });
      return;
    }

    const { name } = getPackageInfo();
    buildState = { status: 'updating' };
    res.json({ message: req.t!('server.info.updateStarted') });

    exec(`npm install -g ${name}@latest`, { timeout: 300_000 }, (err, _stdout, stderr) => {
      if (err) {
        const errorMsg = stderr?.trim() || err.message;
        console.error('[update] npm install failed:', errorMsg);
        buildState = { status: 'failed', error: errorMsg };
        return;
      }
      console.log('[update] Update complete. Spawning new server...');
      spawnAndExit();
    });
  },

  /** GET /api/server/build-status - poll build/update progress */
  async buildStatus(_req: Request, res: Response): Promise<void> {
    res.json(buildState);
  },
};
