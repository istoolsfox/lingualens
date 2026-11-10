// ============================================================
// tests/unit/version.test.ts —— 版本比较 + 版本源同步断言
// ============================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/shared/constants';
import { compareVersions, isNewer } from '../../src/shared/version';

describe('compareVersions', () => {
  it('主版本 / 次版本 / 修订位逐位比较', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.6.2', '0.6.1')).toBe(1);
    expect(compareVersions('0.6.10', '0.6.9')).toBe(1); // 数字比较，非字典序
    expect(compareVersions('0.6.2', '0.6.2')).toBe(0);
    expect(compareVersions('0.5.9', '0.6.0')).toBe(-1);
  });

  it('段数不齐按 0 补齐', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1', '0.9.9')).toBe(1);
  });

  it('无法解析（预发布标签等）视为相等，不触发更新', () => {
    expect(compareVersions('1.0.0-beta', '0.9.0')).toBe(0);
    expect(isNewer('1.0.0-beta', '0.9.0')).toBe(false);
  });

  it('isNewer 只在严格更新时为真', () => {
    expect(isNewer('0.7.0', '0.6.2')).toBe(true);
    expect(isNewer('0.6.2', '0.6.2')).toBe(false);
    expect(isNewer('0.6.1', '0.6.2')).toBe(false);
  });
});

describe('版本单一真源', () => {
  it('APP_VERSION 常量与 public/manifest.json 同步（防三处漂移）', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8')) as {
      version: string;
    };
    expect(manifest.version).toBe(APP_VERSION);
  });
});
