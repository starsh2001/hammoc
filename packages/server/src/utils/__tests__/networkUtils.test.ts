/**
 * Network Utilities Tests
 * Story 17.5: Terminal Security - Task 9
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { isLocalIP, isLoopbackIP, extractClientIP, extractRequestIP, isExternalBinding } from '../networkUtils.js';

// Mock config for trustProxy tests
vi.mock('../../config/index.js', () => ({
  config: {
    server: {
      trustProxy: false,
    },
  },
}));

// Import mocked config so we can toggle trustProxy in tests
import { config } from '../../config/index.js';

describe('isLocalIP', () => {
  // IPv4 loopback
  it('returns true for 127.0.0.1', () => {
    expect(isLocalIP('127.0.0.1')).toBe(true);
  });

  it('returns true for 127.0.0.2 (loopback range)', () => {
    expect(isLocalIP('127.0.0.2')).toBe(true);
  });

  // IPv6 loopback
  it('returns true for ::1', () => {
    expect(isLocalIP('::1')).toBe(true);
  });

  // IPv4-mapped IPv6 loopback
  it('returns true for ::ffff:127.0.0.1', () => {
    expect(isLocalIP('::ffff:127.0.0.1')).toBe(true);
  });

  // Private 192.168.x.x
  it('returns true for 192.168.1.100', () => {
    expect(isLocalIP('192.168.1.100')).toBe(true);
  });

  // Private 10.x.x.x
  it('returns true for 10.0.0.1', () => {
    expect(isLocalIP('10.0.0.1')).toBe(true);
  });

  // Private 172.16-31.x.x
  it('returns true for 172.16.0.1', () => {
    expect(isLocalIP('172.16.0.1')).toBe(true);
  });

  it('returns true for 172.31.255.255', () => {
    expect(isLocalIP('172.31.255.255')).toBe(true);
  });

  // Non-private 172.x.x.x (outside 16-31 range)
  it('returns false for 172.15.0.1', () => {
    expect(isLocalIP('172.15.0.1')).toBe(false);
  });

  it('returns false for 172.32.0.1', () => {
    expect(isLocalIP('172.32.0.1')).toBe(false);
  });

  // Public IPv4
  it('returns false for 8.8.8.8', () => {
    expect(isLocalIP('8.8.8.8')).toBe(false);
  });

  // Public IPv6
  it('returns false for 2001:db8::1', () => {
    expect(isLocalIP('2001:db8::1')).toBe(false);
  });

  // IPv4-mapped public
  it('returns false for ::ffff:8.8.8.8', () => {
    expect(isLocalIP('::ffff:8.8.8.8')).toBe(false);
  });

  // IPv4-mapped private
  it('returns true for ::ffff:192.168.1.1', () => {
    expect(isLocalIP('::ffff:192.168.1.1')).toBe(true);
  });

  it('returns true for ::ffff:10.0.0.1', () => {
    expect(isLocalIP('::ffff:10.0.0.1')).toBe(true);
  });

  // Edge cases
  it('returns false for empty string', () => {
    expect(isLocalIP('')).toBe(false);
  });

  it('returns false for undefined (cast as any)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isLocalIP(undefined as any)).toBe(false);
  });

  // Strict validation — rejects malformed IPs (Codex review #3)
  it('returns false for IP with port suffix (127.0.0.1:443)', () => {
    expect(isLocalIP('127.0.0.1:443')).toBe(false);
  });

  it('returns false for IP with trailing text (127.0.0.1abc)', () => {
    expect(isLocalIP('127.0.0.1abc')).toBe(false);
  });

  it('returns false for IP with leading zeros (127.0.0.01)', () => {
    expect(isLocalIP('127.0.0.01')).toBe(false);
  });
});

describe('isLoopbackIP', () => {
  it('returns true for 127.0.0.1', () => {
    expect(isLoopbackIP('127.0.0.1')).toBe(true);
  });

  it('returns true for ::1', () => {
    expect(isLoopbackIP('::1')).toBe(true);
  });

  it('returns true for ::ffff:127.0.0.1', () => {
    expect(isLoopbackIP('::ffff:127.0.0.1')).toBe(true);
  });

  it('returns true for 127.0.0.2 (loopback range)', () => {
    expect(isLoopbackIP('127.0.0.2')).toBe(true);
  });

  // Private IPs must NOT be loopback
  it('returns false for 192.168.1.1', () => {
    expect(isLoopbackIP('192.168.1.1')).toBe(false);
  });

  it('returns false for 10.0.0.1', () => {
    expect(isLoopbackIP('10.0.0.1')).toBe(false);
  });

  it('returns false for 172.16.0.1', () => {
    expect(isLoopbackIP('172.16.0.1')).toBe(false);
  });

  it('returns false for public IP 8.8.8.8', () => {
    expect(isLoopbackIP('8.8.8.8')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isLoopbackIP('')).toBe(false);
  });

  it('returns false for malformed input (127.0.0.1:443)', () => {
    expect(isLoopbackIP('127.0.0.1:443')).toBe(false);
  });
});

describe('isExternalBinding', () => {
  it('returns true for 0.0.0.0', () => {
    expect(isExternalBinding('0.0.0.0')).toBe(true);
  });

  it('returns true for ::', () => {
    expect(isExternalBinding('::')).toBe(true);
  });

  it('returns false for 127.0.0.1', () => {
    expect(isExternalBinding('127.0.0.1')).toBe(false);
  });

  it('returns false for localhost', () => {
    expect(isExternalBinding('localhost')).toBe(false);
  });

  it('returns true for 192.168.1.100 (external interface)', () => {
    expect(isExternalBinding('192.168.1.100')).toBe(true);
  });
});

describe('extractClientIP', () => {
  afterEach(() => {
    (config.server as { trustProxy: boolean }).trustProxy = false;
  });

  it('extracts IP from socket.handshake.address', () => {
    const mockSocket = {
      handshake: { address: '192.168.1.50', headers: {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('192.168.1.50');
  });

  it('returns empty string when address is undefined', () => {
    const mockSocket = {
      handshake: { address: undefined, headers: {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('');
  });

  it('ignores proxy headers when trustProxy is false', () => {
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.50', 'cf-connecting-ip': '198.51.100.1' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('127.0.0.1');
  });

  it('uses CF-Connecting-IP when trustProxy is true and peer is loopback', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.50' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('198.51.100.1');
  });

  it('uses X-Forwarded-For (rightmost IP) when trustProxy is true and no CF header', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // Rightmost IP (10.0.0.1) is what the proxy added — use that
    expect(extractClientIP(mockSocket)).toBe('10.0.0.1');
  });

  it('rejects XFF spoofing: attacker injects 127.0.0.1 as first value', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        // Attacker sends: X-Forwarded-For: 127.0.0.1
        // Proxy appends real IP: 127.0.0.1, 203.0.113.50
        headers: { 'x-forwarded-for': '127.0.0.1, 203.0.113.50' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // Must return 203.0.113.50 (rightmost, proxy-added), NOT 127.0.0.1 (attacker-injected)
    expect(extractClientIP(mockSocket)).toBe('203.0.113.50');
  });

  it('uses X-Real-IP when trustProxy is true and no CF or XFF header', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'x-real-ip': '203.0.113.99' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('203.0.113.99');
  });

  it('falls back to socket address when trustProxy is true but no proxy headers', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '192.168.1.50',
        headers: {},
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('192.168.1.50');
  });

  // Codex review #1: ignores proxy headers when peer is NOT loopback
  it('ignores proxy headers when trustProxy is true but peer is not loopback', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '203.0.113.10',
        headers: { 'cf-connecting-ip': '127.0.0.1', 'x-forwarded-for': '127.0.0.1' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // Must return actual peer IP, not the spoofed header
    expect(extractClientIP(mockSocket)).toBe('203.0.113.10');
  });

  it('trusts proxy headers when peer is IPv4-mapped loopback (::ffff:127.0.0.1)', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '::ffff:127.0.0.1',
        headers: { 'cf-connecting-ip': '198.51.100.5' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('198.51.100.5');
  });

  // Codex review #3: rejects invalid IP in proxy headers
  it('rejects invalid CF-Connecting-IP and falls back to peer address', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockSocket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'cf-connecting-ip': '127.0.0.1:443' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('127.0.0.1');
  });
});

describe('extractRequestIP', () => {
  afterEach(() => {
    (config.server as { trustProxy: boolean }).trustProxy = false;
  });

  it('extracts IP from req.socket.remoteAddress', () => {
    const mockReq = {
      headers: {},
      socket: { remoteAddress: '192.168.1.50' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('192.168.1.50');
  });

  it('ignores proxy headers when trustProxy is false', () => {
    const mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.50' },
      socket: { remoteAddress: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('127.0.0.1');
  });

  it('uses CF-Connecting-IP when trustProxy is true and peer is loopback', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockReq = {
      headers: { 'cf-connecting-ip': '198.51.100.1' },
      socket: { remoteAddress: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('198.51.100.1');
  });

  it('uses X-Forwarded-For (rightmost IP) when trustProxy is true and no CF header', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('10.0.0.1');
  });

  it('rejects XFF spoofing: attacker injects 127.0.0.1 as first value', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockReq = {
      headers: { 'x-forwarded-for': '127.0.0.1, 203.0.113.50' },
      socket: { remoteAddress: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('203.0.113.50');
  });

  it('rejects non-IP-looking X-Forwarded-For values', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockReq = {
      headers: { 'x-forwarded-for': '<script>alert(1)</script>' },
      socket: { remoteAddress: '127.0.0.1' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('127.0.0.1');
  });

  // Codex review #1: ignores proxy headers when peer is NOT loopback
  it('ignores proxy headers when trustProxy is true but peer is not loopback', () => {
    (config.server as { trustProxy: boolean }).trustProxy = true;
    const mockReq = {
      headers: { 'cf-connecting-ip': '127.0.0.1' },
      socket: { remoteAddress: '203.0.113.10' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractRequestIP(mockReq)).toBe('203.0.113.10');
  });
});
