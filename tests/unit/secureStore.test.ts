import { describe, expect, it } from 'vitest';
import { clearApiKey, hasApiKey, loadApiKey, saveApiKey } from '../../src/background/secureStore';
import type { StorageLike } from '../../src/background/storageLike';

function memStorage(): StorageLike & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    async get(key) {
      return m.get(key);
    },
    async set(key, value) {
      m.set(key, value);
    },
    async remove(key) {
      m.delete(key);
    },
    dump() {
      return Object.fromEntries(m);
    },
  };
}

describe('secureStore API Key 加密存储', () => {
  it('保存→读取 roundtrip（AES-GCM）', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-test-abc123');
    expect(await loadApiKey(s)).toBe('sk-test-abc123');
    expect(await hasApiKey(s)).toBe(true);
  });

  it('密文落盘不暴露明文', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-VERY-SECRET-VALUE');
    const dump = JSON.stringify(s.dump());
    expect(dump).not.toContain('sk-VERY-SECRET-VALUE');
    expect(dump).not.toContain('VERY');
  });

  it('覆盖保存新密钥', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-old');
    await saveApiKey(s, 'sk-new');
    expect(await loadApiKey(s)).toBe('sk-new');
  });

  it('设备密钥更换后旧密文不可恢复（返回空而非崩溃）', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-a');
    // 模拟设备密钥丢失：换一个新的设备密钥（不同 storage 实例同 key 数据槽被删）
    const { DEVICE_KEY_SLOT } = { DEVICE_KEY_SLOT: 'll_dk' };
    await s.set(DEVICE_KEY_SLOT, 'ZmFrZV9kZXZpY2Vfa2V5X2Jhc2U2NA=='); // 伪造
    expect(await loadApiKey(s)).toBe('');
  });

  it('clear 后读取为空', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-x');
    await clearApiKey(s);
    expect(await loadApiKey(s)).toBe('');
    expect(await hasApiKey(s)).toBe(false);
  });

  it('空串保存等于清除', async () => {
    const s = memStorage();
    await saveApiKey(s, 'sk-x');
    await saveApiKey(s, '');
    expect(await hasApiKey(s)).toBe(false);
  });
});
