// ============================================================
// background/secureStore.ts —— API Key 本地加密存储
// 方案：AES-256-GCM（WebCrypto）。安装时生成随机设备密钥，
// Key 以 {iv, ct} 密文落盘 storage.local，设备密钥独立命名空间存放。
//
// 保护边界（诚实声明）：加密落盘防的是"明文泄露"——直接读取存储、
// 存储备份、截屏粘贴时不再暴露明文密钥。它不能防御"浏览器已被完全
// 控制"的攻击者（同机恶意代码同样能取到设备密钥）。这一边界在设置页
// 对用户如实说明。对外发布版可换服务端代理彻底消除本地密钥。
// ============================================================

import type { StorageLike } from './storageLike';

const DEVICE_KEY_SLOT = 'll_dk';
const KEY_DATA_SLOT = 'll_key_enc';

const subtle = crypto.subtle;

function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getOrCreateDeviceKey(storage: StorageLike): Promise<CryptoKey> {
  const existing = await storage.get(DEVICE_KEY_SLOT);
  if (typeof existing === 'string' && existing) {
    const raw = fromB64(existing);
    return subtle.importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const raw = crypto.getRandomValues(new Uint8Array(32));
  await storage.set(DEVICE_KEY_SLOT, toB64(raw.buffer as ArrayBuffer));
  return subtle.importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** 加密并落盘 API Key（覆盖旧值） */
export async function saveApiKey(storage: StorageLike, apiKey: string): Promise<void> {
  if (!apiKey) {
    await storage.remove(KEY_DATA_SLOT);
    return;
  }
  const key = await getOrCreateDeviceKey(storage);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
  await storage.set(KEY_DATA_SLOT, JSON.stringify({ iv: toB64(iv.buffer as ArrayBuffer), ct: toB64(ct) }));
}

/** 读取并解密 API Key；未设置返回空串 */
export async function loadApiKey(storage: StorageLike): Promise<string> {
  const enc = await storage.get(KEY_DATA_SLOT);
  if (typeof enc !== 'string' || !enc) return '';
  try {
    const { iv, ct } = JSON.parse(enc) as { iv: string; ct: string };
    const key = await getOrCreateDeviceKey(storage);
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) as unknown as BufferSource }, key, fromB64(ct) as unknown as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    // 设备密钥丢失/损坏（如手工改存储），密文不可恢复：要求用户重新配置
    return '';
  }
}

/** 清除密钥（保留设备密钥无意义，一并清） */
export async function clearApiKey(storage: StorageLike): Promise<void> {
  await storage.remove(KEY_DATA_SLOT);
  await storage.remove(DEVICE_KEY_SLOT);
}

/** 是否已设置过密钥（不触发解密） */
export async function hasApiKey(storage: StorageLike): Promise<boolean> {
  const enc = await storage.get(KEY_DATA_SLOT);
  return typeof enc === 'string' && enc.length > 0;
}
