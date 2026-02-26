/**
 * Network Utilities for Terminal Security
 * Story 17.5: Terminal Security - IP-based access control
 */

import type { Socket } from 'socket.io';

/**
 * Check if an IP address belongs to a local/private network range.
 * Supports IPv4, IPv6 loopback, and IPv4-mapped IPv6 addresses.
 *
 * Local ranges:
 *   127.0.0.0/8, ::1, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12
 *   ::ffff:<ipv4> variants of the above
 */
export function isLocalIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;

  // IPv6 loopback
  if (ip === '::1') return true;

  // Strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x)
  let normalizedIP = ip;
  if (normalizedIP.startsWith('::ffff:')) {
    normalizedIP = normalizedIP.slice(7);
  }

  // Parse IPv4
  const parts = normalizedIP.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map((p) => parseInt(p, 10));
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return false;

  const [a, b] = octets;

  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (private)
  if (a === 10) return true;

  // 192.168.0.0/16 (private)
  if (a === 192 && b === 168) return true;

  // 172.16.0.0/12 (172.16.x.x ~ 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

/**
 * Extract client IP address from a Socket.io socket.
 * Uses socket.handshake.address directly.
 * X-Forwarded-For and other proxy headers are intentionally ignored for security.
 */
export function extractClientIP(socket: Socket): string {
  return socket.handshake.address || '';
}

/**
 * Check if the server binding address is an external interface.
 * Returns true for 0.0.0.0, ::, or non-loopback/non-localhost addresses.
 */
export function isExternalBinding(host: string): boolean {
  if (!host) return false;

  // Wildcard bindings — listen on all interfaces
  if (host === '0.0.0.0' || host === '::') return true;

  // Loopback addresses and localhost are not external
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;

  // Anything else (e.g. 192.168.1.100) is an external interface
  return true;
}
