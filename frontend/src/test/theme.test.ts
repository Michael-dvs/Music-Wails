import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

type ThemeMode = 'system' | 'light' | 'dark';

// Model the ThemeContext resolution logic
function resolveTheme(
  mode: ThemeMode,
  osDark: boolean
): { theme: 'light' | 'dark'; resolvedMode: ThemeMode } {
  if (mode === 'system') {
    return {
      theme: osDark ? 'dark' : 'light',
      resolvedMode: 'system',
    };
  }
  return {
    theme: mode,
    resolvedMode: mode,
  };
}

describe('Theme Resolution & System Theme Regressions', () => {
  it('resolves system mode to dark when OS prefers dark', () => {
    const result = resolveTheme('system', true);
    assert.equal(result.theme, 'dark');
    assert.equal(result.resolvedMode, 'system');
  });

  it('resolves system mode to light when OS prefers light', () => {
    const result = resolveTheme('system', false);
    assert.equal(result.theme, 'light');
    assert.equal(result.resolvedMode, 'system');
  });

  it('respects explicit dark mode regardless of OS preference', () => {
    const darkWithLightOS = resolveTheme('dark', false);
    assert.equal(darkWithLightOS.theme, 'dark');

    const darkWithDarkOS = resolveTheme('dark', true);
    assert.equal(darkWithDarkOS.theme, 'dark');
  });

  it('respects explicit light mode regardless of OS preference', () => {
    const lightWithDarkOS = resolveTheme('light', true);
    assert.equal(lightWithDarkOS.theme, 'light');

    const lightWithLightOS = resolveTheme('light', false);
    assert.equal(lightWithLightOS.theme, 'light');
  });

  it('persists mode and applied theme correctly in simulated storage', () => {
    const storage: Record<string, string> = {};
    const setItem = (key: string, val: string) => { storage[key] = val; };
    const getItem = (key: string) => storage[key] ?? null;

    // 1. Initial default: system mode with dark OS
    let mode: ThemeMode = (getItem('theme_mode') as ThemeMode) || 'system';
    let { theme } = resolveTheme(mode, true);
    setItem('theme_mode', mode);
    setItem('theme', theme);

    assert.equal(storage['theme_mode'], 'system');
    assert.equal(storage['theme'], 'dark');

    // 2. User switches to light mode
    mode = 'light';
    ({ theme } = resolveTheme(mode, true));
    setItem('theme_mode', mode);
    setItem('theme', theme);

    assert.equal(storage['theme_mode'], 'light');
    assert.equal(storage['theme'], 'light');

    // 3. User switches back to system mode
    mode = 'system';
    ({ theme } = resolveTheme(mode, false)); // OS is now light
    setItem('theme_mode', mode);
    setItem('theme', theme);

    assert.equal(storage['theme_mode'], 'system');
    assert.equal(storage['theme'], 'light');
  });
});
