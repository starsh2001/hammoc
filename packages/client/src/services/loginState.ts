/**
 * Tracks whether an in-app Claude Code login (the disposable OAuth PTY) is currently in flight,
 * shared across hooks via a module singleton.
 *
 * The login PTY is bound to the WebSocket on the server: ANY socket disconnect tears it down
 * (the CLI exits with code 129 and login fails). The OAuth flow REQUIRES the user to leave the
 * tab — open the auth page, copy the code, come back and paste it — which fires a
 * `visibilitychange` on return. `useAppResumeRecovery` would otherwise treat that as a possibly
 * stale connection and force a reconnect, disconnecting the socket and killing the PTY
 * mid-login. The resume-recovery hook consults this flag to suspend that reconnect while a login
 * is active; it resumes normally once the login settles (done / error / unmount).
 */
let loginInProgress = false;

export function setLoginInProgress(active: boolean): void {
  loginInProgress = active;
}

export function isLoginInProgress(): boolean {
  return loginInProgress;
}
