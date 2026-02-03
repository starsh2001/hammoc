// cookie-session's req.sessionOptions type extension
import 'cookie-session';

declare module 'cookie-session' {
  interface CookieSessionOptions {
    maxAge?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      sessionOptions: import('cookie-session').CookieSessionOptions;
    }
  }
}

export {};
