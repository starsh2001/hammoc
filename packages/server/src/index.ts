import { createServer } from 'http';
import { createApp } from './app.js';
import { initializeWebSocket } from './handlers/websocket.js';
import { AuthConfigService } from './services/authConfigService.js';
import { setupInitialPassword, resetPassword } from './cli/passwordSetup.js';

const PORT = process.env.PORT || 3000;

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

  // Listen on HTTP server (not Express app)
  httpServer.listen(PORT, () => {
    console.log(`BMad Studio Server running on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
