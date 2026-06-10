/**
 * Shared xterm.js color themes (Tokyo Night dark / light).
 *
 * Used by both the web terminal (TerminalEmulator) and the CLI-mode debug PTY mirror
 * (CliPtyMirror) so claude's ANSI output renders with the same 16-color palette in
 * either surface. Extracted verbatim from TerminalEmulator's original local definitions.
 */

export const xtermDarkTheme = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

export const xtermLightTheme = {
  background: '#f5f5f5',
  foreground: '#343b58',
  cursor: '#343b58',
  cursorAccent: '#f5f5f5',
  selectionBackground: '#99a7df',
  black: '#0f0f14',
  red: '#8c4351',
  green: '#485e30',
  yellow: '#8f5e15',
  blue: '#34548a',
  magenta: '#5a4a78',
  cyan: '#0f4b6e',
  white: '#343b58',
  brightBlack: '#9699a3',
  brightRed: '#8c4351',
  brightGreen: '#485e30',
  brightYellow: '#8f5e15',
  brightBlue: '#34548a',
  brightMagenta: '#5a4a78',
  brightCyan: '#0f4b6e',
  brightWhite: '#343b58',
};

export function getXtermTheme(resolved: 'dark' | 'light') {
  return resolved === 'dark' ? xtermDarkTheme : xtermLightTheme;
}
