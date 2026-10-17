// Генератор иконок 2Dots без внешних зависимостей: рисует аналитически (со сглаживанием)
// тёмную плашку и две точки — розовую и голубую — и пишет icon.png (1024), icon.icns, icon.ico.
// Запуск: node apps/desktop/build/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const BG = [0x0e, 0x0f, 0x1a];
const PINK = [0xff, 0x5d, 0x8f];
const BLUE = [0x4d, 0xd6, 0xff];

// Геометрия в единицах холста 1024×1024.
const PLATE = { inset: 100, radius: 185 }; // плашка 824×824, как у иконок macOS
const DOTS = [
  { x: 395, y: 590, r: 128, color: PINK },
  { x: 640, y: 420, r: 128, color: BLUE },
];
const GLOW = 2.1; // радиус свечения относительно радиуса точки

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Знаковое расстояние до скруглённого квадрата (отрицательное внутри). */
function roundedRectSdf(x, y) {
  const c = 512;
  const half = 512 - PLATE.inset - PLATE.radius;
  const qx = Math.abs(x - c) - half;
  const qy = Math.abs(y - c) - half;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - PLATE.radius;
}

function blend(dst, src, a) {
  return [
    dst[0] + (src[0] - dst[0]) * a,
    dst[1] + (src[1] - dst[1]) * a,
    dst[2] + (src[2] - dst[2]) * a,
  ];
}

function render(size) {
  const scale = 1024 / size;
  const aa = scale; // ширина сглаживания — один пиксель целевого размера
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * scale;
      const y = (j + 0.5) * scale;
      const plateA = clamp01(0.5 - roundedRectSdf(x, y) / aa);
      let rgb = BG;
      // Мягкое свечение вокруг точек.
      for (const d of DOTS) {
        const dist = Math.hypot(x - d.x, y - d.y);
        const t = clamp01(1 - dist / (d.r * GLOW));
        rgb = blend(rgb, d.color, 0.35 * t * t);
      }
      for (const d of DOTS) {
        const dist = Math.hypot(x - d.x, y - d.y);
        const a = clamp01(0.5 - (dist - d.r) / aa);
        rgb = blend(rgb, d.color, a);
      }
      const o = (j * size + i) * 4;
      px[o] = Math.round(rgb[0]);
      px[o + 1] = Math.round(rgb[1]);
      px[o + 2] = Math.round(rgb[2]);
      px[o + 3] = Math.round(plateA * 255);
    }
  }
  return encodePng(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // глубина
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const cache = new Map();
function png(size) {
  if (!cache.has(size)) cache.set(size, render(size));
  return cache.get(size);
}

function encodeIcns() {
  // Типы записей ICNS с PNG-данными.
  const entries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ];
  const parts = entries.map(([type, size]) => {
    const data = png(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

function encodeIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // тип: иконка
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dir = sizes.map((size, k) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // плоскости
    e.writeUInt16LE(32, 6); // бит на пиксель
    e.writeUInt32LE(images[k].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[k].length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images]);
}

writeFileSync(join(OUT_DIR, 'icon.png'), png(1024));
writeFileSync(join(OUT_DIR, 'icon.icns'), encodeIcns());
writeFileSync(join(OUT_DIR, 'icon.ico'), encodeIco());
console.log('Иконки записаны в', OUT_DIR);
