import { createServer } from 'http';
import os from 'os';
import { createApp } from './app.js';
import { initializeWebSocket } from './handlers/websocket.js';
import { AuthConfigService } from './services/authConfigService.js';
import { setupInitialPassword, resetPassword } from './cli/passwordSetup.js';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

function getLocalIP(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

/** CLI 옵션 파싱 */
function parseCliOptions(): { resetPassword: boolean } {
  return {
    resetPassword: process.argv.includes('--reset-password'),
  };
}

async function main() {
  const options = parseCliOptions();
  const authConfig = new AuthConfigService();

  // --reset-password 옵션 처리
  if (options.resetPassword) {
    await resetPassword();
    process.exit(0);
  }

  // 최초 실행 시 패스워드 설정
  if (!authConfig.isPasswordConfigured()) {
    await setupInitialPassword();
  }

  // Create Express app (async for session secret loading)
  const app = await createApp();

  // Create HTTP server from Express app
  const httpServer = createServer(app);

  // Initialize WebSocket (async for session middleware - Story 2.5)
  await initializeWebSocket(httpServer);

  // Listen with retry logic for EADDRINUSE (Windows port release delay on tsx watch restart)
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 1000;

  function startListening(attempt: number) {
    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_RETRIES) {
        console.log(`Port ${PORT} in use, retrying in ${RETRY_DELAY_MS}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        setTimeout(() => startListening(attempt + 1), RETRY_DELAY_MS);
      } else {
        console.error('Failed to start server:', err);
        process.exit(1);
      }
    });

    httpServer.listen(Number(PORT), HOST, () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const localIP = getLocalIP();
      console.log(`BMad Studio Server running on:`);
      console.log(`  Local:   http://localhost:${PORT}`);
      if (localIP) console.log(`  Network: http://${localIP}:${PORT}`);
      console.log(`  Mode:    ${isProduction ? 'production (serving static client files)' : 'development'}`);
    });
  }

  startListening(0);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
