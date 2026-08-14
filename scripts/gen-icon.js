const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const LIGHT = [224, 224, 224];
const DARK = [45, 45, 50];

function inRoundedRect(x, y, rx, ry, w, h, r) {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const cx1 = rx + r, cy1 = ry + r, cx2 = rx + w - r, cy2 = ry + h - r;
  const dx = Math.max(cx1 - x, x - cx2, 0);
  const dy = Math.max(cy1 - y, y - cy2, 0);
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const DROP = [[370,190],[430,190],[430,250],[490,250],[490,310],[550,310],[550,460],[490,460],[490,520],[310,520],[310,460],[250,460],[250,310],[310,310],[310,250],[370,250]];
const A1 = [[370,280],[430,280],[430,310],[460,310],[460,430],[415,430],[415,370],[385,370],[385,430],[340,430],[340,310],[370,310]];
const A2 = [[385,310],[415,310],[415,340],[385,340]];
const SCREWS = [[160,160],[604,160],[160,604],[604,604]];

function inA(x, y) {
  return inPolygon(A1, x, y) && !inPolygon(A2, x, y);
}

function render(size) {
  const ss = size * 2;
  const buf = Buffer.alloc(ss * ss * 4);
  const step = 800 / ss;
  for (let j = 0; j < ss; j++) {
    const y = (j + 0.5) * step;
    for (let i = 0; i < ss; i++) {
      const x = (i + 0.5) * step;
      let c = null;
      if (inRoundedRect(x, y, 100, 100, 600, 600, 105)) c = LIGHT;
      if (SCREWS.some(([sx, sy]) => inRoundedRect(x, y, sx, sy, 36, 36, 9))) c = DARK;
      if (inPolygon(DROP, x, y)) c = DARK;
      if (inA(x, y)) c = LIGHT;
      const o = (j * ss + i) * 4;
      if (c) { buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255; }
    }
  }
  const out = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dj = 0; dj < 2; dj++) {
        for (let di = 0; di < 2; di++) {
          const o = ((j * 2 + dj) * ss + (i * 2 + di)) * 4;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2]; a += buf[o + 3];
        }
      }
      const o = (j * size + i) * 4;
      out[o] = Math.round(r / 4); out[o + 1] = Math.round(g / 4);
      out[o + 2] = Math.round(b / 4); out[o + 3] = Math.round(a / 4);
    }
  }
  return PNG.sync.write({ width: size, height: size, data: out });
}

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map((size) => ({ size, data: render(size) }));
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), pngs[0].data);

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
const entries = [];
let offset = 6 + pngs.length * 16;
for (const { size, data } of pngs) {
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += data.length;
}
fs.writeFileSync(
  path.join(__dirname, '..', 'assets', 'icon.ico'),
  Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
);
console.log('ok: assets/icon.ico + assets/icon.png (' + sizes.join(',') + 'px)');