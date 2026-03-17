/**
 * Network Utilities for Terminal Security
 * Story 17.5: Terminal Security - IP-based access control
 */

import { isIP } from 'net';
import type { Socket } from 'socket.io';
import type { Request } from 'express';
import { config } from '../config/index.js';

/**
 * Strict IPv4 octet pattern — rejects leading zeros, ports, suffixes.
 * Matches "0"-"255" only (no "01", "127.0.0.1:443", "127.0.0.1abc").
 */
const STRICT_IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/;

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

  // Strict IPv4 format check — rejects "127.0.0.1:443", "127.0.0.1abc", etc.
  if (!STRICT_IPV4_RE.test(normalizedIP)) return false;

  const parts = normalizedIP.split('.');
  const octets = parts.map((p) => parseInt(p, 10));
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
 * Check if an IP is strictly a loopback address (127.0.0.0/8 or ::1).
 * Use this for privileged operations (server restart/update) where
 * even private network IPs should NOT be trusted.
 */
export function isLoopbackIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  if (ip === '::1') return true;
  let normalizedIP = ip;
  if (normalizedIP.startsWith('::ffff:')) {
    normalizedIP = normalizedIP.slice(7);
  }
  if (!STRICT_IPV4_RE.test(normalizedIP)) return false;
  const first = parseInt(normalizedIP.split('.')[0], 10);
  return first === 127;
}

/**
 * Check if the peer (direct TCP connection) is a loopback address.
 * Used to gate whether proxy headers should be trusted — only trust
 * forwarding headers when the immediate connection is from localhost
 * (i.e. cloudflared or nginx running on the same machine).
 */
function isPeerLoopback(peerAddress: string): boolean {
  if (!peerAddress) return false;
  const addr = peerAddress.startsWith('::ffff:') ? peerAddress.slice(7) : peerAddress;
  return addr === '127.0.0.1' || addr === '::1';
}

/**
 * Validate and sanitize an IP string from a proxy header.
 * Returns the IP if valid, empty string otherwise.
 */
function validateIP(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  // Use Node.js built-in net.isIP for strict validation
  if (isIP(trimmed) === 0) return '';
  return trimmed;
}

/**
 * Extract the rightmost valid IP from a comma-separated X-Forwarded-For header.
 * The rightmost entry is the one added by the closest trusted proxy, which is
 * the most reliable — leftmost entries can be attacker-injected.
 *
 * Format: "client, proxy1, proxy2" — rightmost is added by our proxy.
 * Returns empty string if no valid IP found.
 */
function extractRightmostIP(headerValue: string | undefined): string {
  if (!headerValue) return '';
  const parts = headerValue.split(',');
  // Walk from right to find the first valid non-private IP,
  // or fall back to the rightmost valid IP
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].trim();
    if (candidate && isIP(candidate) !== 0) {
      return candidate;
    }
  }
  return '';
}

/**
 * Read proxy headers to determine real client IP.
 * Priority: CF-Connecting-IP > X-Forwarded-For > X-Real-IP.
 * Returns empty string if no valid proxy header found.
 */
function extractFromProxyHeaders(headers: Record<string, string | string[] | undefined>): string {
  // CF-Connecting-IP is set by Cloudflare and is a single IP (most reliable)
  const cfIP = validateIP(headers['cf-connecting-ip'] as string | undefined);
  if (cfIP) return cfIP;
  // X-Forwarded-For is standard for reverse proxies
  const forwarded = extractRightmostIP(headers['x-forwarded-for'] as string | undefined);
  if (forwarded) return forwarded;
  // X-Real-IP is used by nginx
  const realIP = validateIP(headers['x-real-ip'] as string | undefined);
  if (realIP) return realIP;
  return '';
}

/**
 * Extract client IP address from a Socket.io socket.
 * When TRUST_PROXY is enabled AND the direct peer is loopback,
 * reads proxy headers to get the real client IP.
 * Otherwise uses socket.handshake.address directly (safe for direct connections).
 */
export function extractClientIP(socket: Socket): string {
  const peerAddress = socket.handshake.address || '';
  if (config.server.trustProxy && isPeerLoopback(peerAddress)) {
    const proxyIP = extractFromProxyHeaders(socket.handshake.headers);
    if (proxyIP) return proxyIP;
  }
  return peerAddress;
}

/**
 * Extract client IP address from an Express request.
 * When TRUST_PROXY is enabled AND the direct peer is loopback,
 * reads proxy headers to get the real client IP.
 * Otherwise uses req.socket.remoteAddress directly.
 */
export function extractRequestIP(req: Request): string {
  const peerAddress = req.socket.remoteAddress || '';
  if (config.server.trustProxy && isPeerLoopback(peerAddress)) {
    const proxyIP = extractFromProxyHeaders(req.headers);
    if (proxyIP) return proxyIP;
  }
  return peerAddress;
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
