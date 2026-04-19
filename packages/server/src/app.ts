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
import rateLimit from 'express-rate-limit';
import { extractRequestIP } from './utils/networkUtils.js';
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
import { createSessionMiddleware } from './middleware/session.js';
import { authMiddlewareWithExclusions } from './middleware/auth.js';
import { i18nMiddleware } from './middleware/i18n.js';
import { config } from './config/index.js';
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
        scriptSrc: ["'self'"],
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

  // General rate limiting per IP (skip health endpoints)
  // Default 200/min — increase via RATE_LIMIT env var for multi-hop proxy setups
  // where multiple users share the same proxy IP
  app.use(rateLimit({
    windowMs: 60_000,
    limit: parseInt(process.env.RATE_LIMIT || '200', 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => extractRequestIP(req),
    skip: (req) => req.path === '/health' || req.path === '/api/health' || req.path === '/api/debug/log',
  }));

  // Dedicated rate limiter for debug log endpoint (more permissive, prevents abuse)
  app.use('/api/debug/log', rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => extractRequestIP(req),
  }));

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

  // Server management routes (restart)
  app.use('/api/server', serverRoutes);

  // Debug routes (server-side logging + test helpers) — dev mode or explicit opt-in.
  // Integration test launcher runs in production mode but sets ENABLE_TEST_ENDPOINTS=true
  // to enable R-01-01 kill-ws test helper.
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.ENABLE_TEST_ENDPOINTS === 'true'
  ) {
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
