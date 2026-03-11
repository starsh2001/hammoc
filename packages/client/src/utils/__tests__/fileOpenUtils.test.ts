import { describe, it, expect } from 'vitest';
import { toRelativePath } from '../fileOpenUtils';

describe('toRelativePath', () => {
  it('converts absolute path to relative', () => {
    expect(toRelativePath('d:/repo/project/src/file.tsx', 'd:/repo/project')).toBe('src/file.tsx');
  });

  it('handles backslash paths', () => {
    expect(toRelativePath('d:\\repo\\project\\src\\file.tsx', 'd:\\repo\\project')).toBe('src/file.tsx');
  });

  it('handles mixed separators', () => {
    expect(toRelativePath('d:\\repo\\project/src/file.tsx', 'd:/repo/project')).toBe('src/file.tsx');
  });

  it('handles case-insensitive comparison on Windows', () => {
    expect(toRelativePath('D:\\Repo\\Project\\src\\file.tsx', 'd:\\repo\\project')).toBe('src/file.tsx');
  });

  it('returns original path when root does not match', () => {
    expect(toRelativePath('/other/path/file.tsx', '/repo/project')).toBe('/other/path/file.tsx');
  });

  it('returns original path when projectRoot is empty', () => {
    expect(toRelativePath('/repo/project/file.tsx', '')).toBe('/repo/project/file.tsx');
  });

  it('strips trailing slashes from root', () => {
    expect(toRelativePath('d:/repo/project/file.tsx', 'd:/repo/project/')).toBe('file.tsx');
  });

  it('handles already relative paths', () => {
    expect(toRelativePath('src/file.tsx', 'd:/repo/project')).toBe('src/file.tsx');
  });
});
