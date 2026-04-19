import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    __HAMMOC_PERMISSION_TIMEOUT_MS__?: number;
  }
}

/**
 * Auto-denies a permission request after the timeout set by
 * window.__HAMMOC_PERMISSION_TIMEOUT_MS__ (in ms).
 *
 * Used in integration tests to avoid 5-minute manual waits:
 *   browser_evaluate("() => { window.__HAMMOC_PERMISSION_TIMEOUT_MS__ = 3000; return true }")
 *
 * Has no effect in production (the global is never set).
 */
export function usePermissionTimeout(
  permissionStatus: 'waiting' | 'approved' | 'denied' | undefined,
  onPermissionRespond: ((approved: boolean) => void) | undefined,
) {
  const callbackRef = useRef(onPermissionRespond);
  callbackRef.current = onPermissionRespond;

  useEffect(() => {
    if (permissionStatus !== 'waiting') return;

    const timeoutMs = window.__HAMMOC_PERMISSION_TIMEOUT_MS__;
    if (typeof timeoutMs !== 'number') return;

    const id = setTimeout(() => {
      callbackRef.current?.(false);
    }, timeoutMs);

    return () => clearTimeout(id);
  }, [permissionStatus]);
}
