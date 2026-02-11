/**
 * Server Configuration
 * Story 4.6: Environment-based configuration for chat settings
 */

/**
 * Server configuration object
 * Centralized configuration management with environment variable support
 */
export const config = {
  /**
   * Chat-related settings
   */
  chat: {
    /**
     * Chat response timeout in milliseconds
     * Default: 300000 (5 minutes)
     * Activity-based: resets on every SDK message AND every 30s heartbeat while
     * generator.next() is pending (SDK alive but not yielding messages).
     * Configurable via CHAT_TIMEOUT_MS environment variable
     */
    timeoutMs: parseInt(process.env.CHAT_TIMEOUT_MS || '300000', 10),
  },

  /**
   * Server settings
   */
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
  },

  /**
   * WebSocket settings
   */
  websocket: {
    cors: {
      // Allow any origin in development for mobile/remote access
      origin: process.env.CORS_ORIGIN || true,
      methods: ['GET', 'POST'] as string[],
      credentials: true as const,
    },
  },

  /**
   * Telegram notification settings (optional)
   * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable
   */
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
  },
} as const;

export type Config = typeof config;
