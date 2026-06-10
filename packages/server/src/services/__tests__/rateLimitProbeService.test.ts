/**
 * rateLimitProbeService Tests
 *
 * Covers the OAuth usage parsing (all windows: 5h + general/Opus/Sonnet weekly) and the
 * usage-limit corroboration guard used by the CLI engine to refute screen-scraped limit
 * false positives. The on-disk credential read and the network fetch are stubbed so probe()
 * is hermetic; Date.now is pinned so the freshness window is deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimitProbeService } from '../rateLimitProbeService.js';

const stubFetch = (body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));

describe('rateLimitProbeService', () => {
  let t = 1_000_000;
  let readToken: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    t = 1_000_000;
    // Bypass the ~/.claude/.credentials.json read so probe() does not depend on a real account.
    readToken = vi
      .spyOn(rateLimitProbeService as unknown as { readAccessToken: () => string | null }, 'readAccessToken')
      .mockReturnValue('tok');
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => t);
  });

  afterEach(() => {
    readToken.mockRestore();
    nowSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('parses 5h + all weekly windows (general/Opus/Sonnet), normalizing 0–100 → 0–1 and omitting null windows', async () => {
    stubFetch({
      five_hour: { utilization: 23, resets_at: 'r1' },
      seven_day: { utilization: 7, resets_at: 'r2' },
      seven_day_opus: null, // no separate Opus cap on this plan → omitted
      seven_day_sonnet: { utilization: 0, resets_at: 'r3' },
    });
    const res = await rateLimitProbeService.probe();
    expect(res?.fiveHour?.utilization).toBeCloseTo(0.23);
    expect(res?.sevenDay?.utilization).toBeCloseTo(0.07);
    expect(res?.sevenDayOpus).toBeUndefined();
    expect(res?.sevenDaySonnet?.utilization).toBe(0);
    expect(res?.overallStatus).toBe('normal');
  });

  it('isLimitCorroborated → false when fresh data shows headroom on every window (refutes a scraped limit)', async () => {
    stubFetch({ five_hour: { utilization: 23, resets_at: 'r' }, seven_day: { utilization: 7, resets_at: 'r' } });
    await rateLimitProbeService.probe();
    expect(rateLimitProbeService.isLimitCorroborated()).toBe(false);
  });

  it('isLimitCorroborated → true when an Opus-weekly window is at the cap (general weekly still low)', async () => {
    stubFetch({
      five_hour: { utilization: 10, resets_at: 'r' },
      seven_day: { utilization: 7, resets_at: 'r' },
      seven_day_opus: { utilization: 99, resets_at: 'r' },
    });
    await rateLimitProbeService.probe();
    expect(rateLimitProbeService.isLimitCorroborated()).toBe(true);
  });

  it('isLimitCorroborated → true when the cached probe is stale (cannot refute → trust the scrape)', async () => {
    stubFetch({ five_hour: { utilization: 5, resets_at: 'r' }, seven_day: { utilization: 5, resets_at: 'r' } });
    await rateLimitProbeService.probe(); // recorded at t
    t += 6 * 60_000 + 1; // advance just past the 6min corroboration TTL
    expect(rateLimitProbeService.isLimitCorroborated()).toBe(true);
  });
});
