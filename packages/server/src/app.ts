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
import cliRoutes from './routes/cli.js';
import authRoutes from './routes/auth.js';
import projectsRoutes from './routes/projects.js';
import sessionsRoutes from './routes/sessions.js';
import commandsRoutes from './routes/commands.js';
import preferencesRoutes from './routes/preferences.js';
import debugRoutes from './routes/debug.js';
import fileSystemRoutes from './routes/fileSystem.js';
import bmadStatusRoutes from './routes/bmadStatus.js';
import queueRoutes from './routes/queue.js';
import gitRoutes from './routes/git.js';
import dashboardRoutes from './routes/dashboard.js';
import boardRoutes from './routes/board.js';
import { createSessionMiddleware } from './middleware/session.js';
import { authMiddlewareWithExclusions } from './middleware/auth.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('app');

/**
 * Create and configure Express app
 * @returns Configured Express application
 */
export async function createApp(): Promise<Express> {
  const app = express();

  // CORS configuration (for local development)
  // Allow any origin in development for mobile/remote access
  app.use(
    cors({
      origin: true, // Reflects the request origin for development
      credentials: true,
    })
  );

  app.use(express.json());

  // Session middleware (Story 2.2, 2.4 - must be before routes)
  // Now async to load persisted session secret
  const sessionMiddleware = await createSessionMiddleware();
  app.use(sessionMiddleware);

  // Authentication middleware (Story 2.5 - must be after session)
  app.use(authMiddlewareWithExclusions);

  // Health check endpoint (AC: 3)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // API health endpoint (for client)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
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

  // Debug routes (server-side logging for client debugging)
  app.use('/api/debug', debugRoutes);

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
