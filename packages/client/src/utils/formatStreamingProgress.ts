/**
 * CLI-style streaming-progress formatters — mirror the readout beside the claude TUI spinner
 * (`… · 1m 4s · ↓ 2.3k tokens`) so Hammoc's CLI counter matches the real tool: time comes BEFORE
 * the token count, the elapsed clock uses minute/second units (not `mm:ss`), and the token count
 * abbreviates thousands as `k`.
 */

/** Elapsed clock: "Ns" under a minute, else "Nm Ns" (e.g. 45 → "45s", 64 → "1m 4s", 700 → "11m 40s"). */
export const formatElapsed = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Token count: the integer under 1000, else "N.Nk" (e.g. 920 → "920", 2345 → "2.3k", 12000 → "12.0k"). */
export const formatTokensK = (n: number): string => {
  const v = Math.max(0, Math.floor(n));
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
};
