import { describe, it, expect } from 'vitest';
import { getLanguageFromPath } from '../languageDetect';

describe('getLanguageFromPath', () => {
  it('TC-LD1: .ts → typescript', () => {
    expect(getLanguageFromPath('src/index.ts')).toBe('typescript');
  });

  it('TC-LD2: .tsx → typescript', () => {
    expect(getLanguageFromPath('src/App.tsx')).toBe('typescript');
  });

  it('TC-LD3: .js → javascript', () => {
    expect(getLanguageFromPath('lib/utils.js')).toBe('javascript');
  });

  it('TC-LD4: .jsx → javascript', () => {
    expect(getLanguageFromPath('src/Component.jsx')).toBe('javascript');
  });

  it('TC-LD5: .py → python', () => {
    expect(getLanguageFromPath('scripts/main.py')).toBe('python');
  });

  it('TC-LD6: .yaml → yaml', () => {
    expect(getLanguageFromPath('config/app.yaml')).toBe('yaml');
  });

  it('TC-LD7: .yml → yaml', () => {
    expect(getLanguageFromPath('docker-compose.yml')).toBe('yaml');
  });

  it('TC-LD8: .json → json', () => {
    expect(getLanguageFromPath('package.json')).toBe('json');
  });

  it('TC-LD9: .html → html', () => {
    expect(getLanguageFromPath('public/index.html')).toBe('html');
  });

  it('TC-LD10: .css → css', () => {
    expect(getLanguageFromPath('src/styles/main.css')).toBe('css');
  });

  it('TC-LD11: .md → markdown', () => {
    expect(getLanguageFromPath('README.md')).toBe('markdown');
  });

  it('TC-LD12: no extension → plaintext', () => {
    expect(getLanguageFromPath('Dockerfile')).toBe('plaintext');
  });

  it('TC-LD13: unsupported extension .xyz → plaintext', () => {
    expect(getLanguageFromPath('data.xyz')).toBe('plaintext');
  });

  it('TC-LD14: should use last extension only (e.g. app.config.ts → typescript)', () => {
    expect(getLanguageFromPath('src/app.config.ts')).toBe('typescript');
  });
});

