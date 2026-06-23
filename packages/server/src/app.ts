/**
 * Express App Factory
 * [Source: Story 2.4 - Task 2]
 *
 * Changed from sync to async pattern to support
 * loading persisted session secret from config file.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cliRoutes from './routes/cli.js';
import authRoutes from './routes/auth.js';
import projectsRoutes from './routes/projects.js';
import sessionsRoutes from './routes/sessions.js';
import commandsRoutes from './routes/commands.js';
import preferencesRoutes from './routes/preferences.js';
import accountRoutes from './routes/account.js';
import debugRoutes from './routes/debug.js';
import fileSystemRoutes from './routes/fileSystem.js';
import bmadStatusRoutes from './routes/bmadStatus.js';
import queueRoutes from './routes/queue.js';
import gitRoutes from './routes/git.js';
import dashboardRoutes from './routes/dashboard.js';
import boardRoutes from './routes/board.js';
import imageRoutes from './routes/images.js';
import serverRoutes from './routes/server.js';
import harnessRoutes from './routes/harness.js';
import snippetsRoutes from './routes/snippets.js';
import systemBrowseRoutes from './routes/systemBrowse.js';
import { createSessionMiddleware } from './middleware/session.js';
import { authMiddlewareWithExclusions } from './middleware/auth.js';
import { i18nMiddleware } from './middleware/i18n.js';
import { config } from './config/index.js';
import { preferencesService } from './services/preferencesService.js';
import { createLogger } from './utils/logger.js';

// Initialize server i18n (Epic 22)
import './i18n.js';

const log = createLogger('app');

/**
 * Create and configure Express app
 * @returns Configured Express application
 */
export async function createApp(): Promise<Express> {
  const app = express();

  // Trust proxy headers (X-Forwarded-Proto, etc.) so secure cookies work behind TLS proxies
  if (config.server.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Security headers (X-Frame-Options, X-Content-Type-Options, CSP, etc.)
  // HSTS and crossOriginOpenerPolicy are only useful behind a TLS-terminating proxy.
  // Sending them over plain HTTP causes browsers to force-upgrade to HTTPS,
  // breaking direct HTTP access (e.g. VPN/LAN at http://192.168.x.x:3000).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'wasm-unsafe-eval' permits WebAssembly.instantiate without allowing
        // JS eval. Required by Shiki's oniguruma-to-es WASM highlighter.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        // Helmet defaults include upgrade-insecure-requests, which forces
        // browsers to upgrade all HTTP sub-resources to HTTPS — breaking
        // direct HTTP access. Only enable behind a TLS proxy.
        ...(config.server.trustProxy ? {} : { upgradeInsecureRequests: null }),
      },
    },
    hsts: config.server.trustProxy,
    crossOriginOpenerPolicy: config.server.trustProxy,
  }));

  // CORS configuration — uses CORS_ORIGIN env var when set, otherwise reflects request origin
  app.use(
    cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    })
  );

  // Request rate limiting is an infrastructure concern (reverse proxy / WAF /
  // API gateway), not the application's. Operators control traffic shaping at
  // the edge where they own the topology (real client IPs, multi-instance
  // accounting, policy rollout) — the app must not duplicate it.

  app.use(express.json());

  // Session middleware (Story 2.2, 2.4 - must be before routes)
  // Now async to load persisted session secret
  const sessionMiddleware = await createSessionMiddleware();
  app.use(sessionMiddleware);

  // Authentication middleware (Story 2.5 - must be after session)
  app.use(authMiddlewareWithExclusions);

  // i18n middleware (Epic 22 - must be before routes)
  app.use(i18nMiddleware);

  // Health check endpoint (AC: 3)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // API health endpoint (for client) - includes package metadata
  app.get('/api/health', (_req: Request, res: Response) => {
    const { pkg } = config;
    res.json({
      status: 'healthy',
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      author: pkg.author,
      repository: pkg.repository,
      homepage: pkg.homepage,
      timestamp: new Date().toISOString(),
    });
  });

  // CLI status routes (Story 1.7)
  app.use('/api', cliRoutes);

  // Auth routes (Story 2.2)
  app.use('/api/auth', authRoutes);

  // Projects routes (Story 3.1)
  app.use('/api/projects', projectsRoutes);

  // Sessions routes (Story 3.3) - mounted under /api/projects for nested resource
  app.use('/api/projects', sessionsRoutes);

  // Commands routes (Story 5.1)
  app.use('/api/projects', commandsRoutes);

  // Preferences routes (global user settings)
  app.use('/api/preferences', preferencesRoutes);

  // Account info routes (Claude Code subscription/provider)
  app.use('/api/account', accountRoutes);

  // File System routes (Story 11.1) - file reading and directory listing
  app.use('/api/projects', fileSystemRoutes);

  // BMad Dashboard Status routes (Story 12.1)
  app.use('/api/projects', bmadStatusRoutes);

  // Queue Runner routes (Story 15.2)
  app.use('/api/projects', queueRoutes);

  // Git Integration routes (Story 16.1)
  app.use('/api/projects', gitRoutes);

  // Dashboard status aggregation routes (Story 20.1)
  app.use('/api/dashboard', dashboardRoutes);

  // Board routes (Story 21.1)
  app.use('/api/projects', boardRoutes);

  // Image serving routes (Story 27.2)
  app.use('/api/projects', imageRoutes);

  // Harness workbench routes (Story 28.0.5) — independent of /api/projects
  // because the user scope (~/.claude) is not nested under any project.
  app.use('/api/harness', harnessRoutes);

  // Snippet management routes (Story 29.2) — Hammoc-native `%name%` system,
  // intentionally separate from `/api/harness/*` so the URL boundary makes
  // the system-of-record obvious.
  app.use('/api/snippets', snippetsRoutes);

  // System browse routes (Story 34.1) — directory-only host filesystem browse
  // for project-path selection. Mounted under /api/system (not /api/projects)
  // because it runs before a project exists, so there is no project boundary.
  // Auth is automatic via authMiddlewareWithExclusions (not in PUBLIC_ROUTES).
  app.use('/api/system', systemBrowseRoutes);

  // Server management routes (restart)
  app.use('/api/server', serverRoutes);

  // Debug routes (server-side logging + test helpers) — dev mode or explicit opt-in.
  // Integration test launcher runs in production mode but sets ENABLE_TEST_ENDPOINTS=true
  // to enable R-01-01 kill-ws test helper.
  if (config.debug.enabled) {
    // Story BS-6: under the HAMMOC_DEBUG gate the routes are always mounted, but wrapped
    // with a runtime guard so the "Test Endpoints" toggle (debugTestEndpoints preference)
    // can enable/disable /api/debug/* live without a restart. The original env var still
    // works as a fallback when the preference is unset.
    app.use('/api/debug', async (req: Request, res: Response, next: express.NextFunction) => {
      const prefs = await preferencesService.readPreferences();
      const allowed = prefs.debugTestEndpoints || process.env.ENABLE_TEST_ENDPOINTS === 'true';
      if (!allowed) {
        res.status(403).json({ error: { code: 'DEBUG_ENDPOINTS_DISABLED', message: 'Debug endpoints disabled' } });
        return;
      }
      next();
    }, debugRoutes);
  } else if (
    process.env.NODE_ENV === 'development' ||
    process.env.ENABLE_TEST_ENDPOINTS === 'true'
  ) {
    // Existing behavior when HAMMOC_DEBUG is not set: static env var check only.
    app.use('/api/debug', debugRoutes);
  }

  // Production: serve built client static files
  if (process.env.NODE_ENV === 'production') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDistPath = path.resolve(__dirname, '../../client/dist');

    if (existsSync(clientDistPath)) {
      app.use(express.static(clientDistPath));
      // SPA fallback: non-API routes → index.html
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
      });
      log.info(`Serving client from ${clientDistPath}`);
    } else {
      log.warn(`Client build not found at ${clientDistPath} — run "npm run build" first`);
    }
  }

  return app;
}
