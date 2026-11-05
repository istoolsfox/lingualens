// ============================================================
// scripts/zip.mjs —— 打包 dist 为可上传的 zip（零依赖）
// ============================================================

import { deflateSync } from 'node:zlib';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outDir = join(root, 'output');
mkdirSync(outDir, { recursive: true });

function crc32Table() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const TABLE = crc32Table();
function crc32(buf) {
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ TABLE[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(dist);
const chunks = [];
const central = [];
let offset = 0;

for (const f of files) {
  const name = relative(dist, f).replaceAll('\\', '/');
  const data = readFileSync(f);
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = deflateSync(data);
  const useDeflate = comp.length < data.length;
  const payload = useDeflate ? comp : data;
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(0, 10); // time
  local.writeUInt16LE(0x5200 >> 0 ? 0 : 0, 12); // date (0 ok)
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, payload);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(payload.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nameBuf);

  offset += local.length + nameBuf.length + payload.length;
}

const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...chunks, cdBuf, end]);
const out = join(outDir, 'lingualens-v0.1.0.zip');
writeFileSync(out, zip);
console.log(`zip: ${out} (${files.length} files, ${(zip.length / 1024).toFixed(0)} KB)`);
