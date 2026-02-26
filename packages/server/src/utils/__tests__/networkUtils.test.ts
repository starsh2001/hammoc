/**
 * Network Utilities Tests
 * Story 17.5: Terminal Security - Task 9
 */

import { describe, it, expect } from 'vitest';
import { isLocalIP, extractClientIP, isExternalBinding } from '../networkUtils.js';

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
  it('extracts IP from socket.handshake.address', () => {
    const mockSocket = {
      handshake: { address: '192.168.1.50' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('192.168.1.50');
  });

  it('returns empty string when address is undefined', () => {
    const mockSocket = {
      handshake: { address: undefined },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(extractClientIP(mockSocket)).toBe('');
  });
});
