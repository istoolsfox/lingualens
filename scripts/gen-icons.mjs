// ============================================================
// scripts/gen-icons.mjs —— 生成扩展图标（纯 Node PNG 写入，零依赖）
// 造型：深靛蓝圆角方块 + 白色透镜圆环 + 手柄
// ============================================================

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path, size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`icon: ${path}`);
}

function roundedRectDist(x, y, size, radius) {
  const rx = Math.max(radius - x, x - (size - 1 - radius), 0);
  const ry = Math.max(radius - y, y - (size - 1 - radius), 0);
  return Math.hypot(rx, ry);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size;
  const bg = [79, 70, 229]; // indigo-600
  const bgEdge = [67, 56, 202]; // indigo-700
  const white = [255, 255, 255];
  const radius = s * 0.22;
  const cx = s * 0.44;
  const cy = s * 0.44;
  const rOuter = s * 0.24;
  const rInner = s * 0.15;
  // 手柄：从圆环右下延伸
  const hx1 = s * 0.6;
  const hy1 = s * 0.6;
  const hx2 = s * 0.8;
  const hy2 = s * 0.8;
  const handleW = s * 0.09;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const dRect = roundedRectDist(x + 0.5, y + 0.5, s, radius);
      if (dRect > radius) {
        px[i + 3] = 0;
        continue;
      }
      // 背景（轻微对角渐变）
      const t = (x + y) / (2 * s);
      px[i] = bgEdge[0] + (bg[0] - bgEdge[0]) * t;
      px[i + 1] = bgEdge[1] + (bg[1] - bgEdge[1]) * t;
      px[i + 2] = bgEdge[2] + (bg[2] - bgEdge[2]) * t;
      px[i + 3] = 255;

      // 透镜圆环
      const dC = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dC <= rOuter && dC >= rInner) {
        px[i] = white[0];
        px[i + 1] = white[1];
        px[i + 2] = white[2];
      }
      // 手柄（点到线段距离）
      const vx = hx2 - hx1;
      const vy = hy2 - hy1;
      const wx = x + 0.5 - hx1;
      const wy = y + 0.5 - hy1;
      const t2 = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
      const dLine = Math.hypot(wx - t2 * vx, wy - t2 * vy);
      if (dLine <= handleW) {
        px[i] = white[0];
        px[i + 1] = white[1];
        px[i + 2] = white[2];
      }
    }
  }
  return px;
}

for (const size of [16, 48, 128]) {
  writePng(join(outDir, `icon${size}.png`), size, render(size));
}
console.log('icons done');
