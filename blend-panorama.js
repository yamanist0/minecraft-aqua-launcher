// panoramanin dikiş kenarlarini cross-fade ile karistirir, dikiş izi kaybolur
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, 'assets', 'panorama');
const BACKUP_DIR = path.join(DIR, '_original');

// kup duzeni: left(0) front(1) right(2) back(3); ciftler [sol, sag]
const SEAMS = [
    ['panorama_1.png', 'panorama_2.png'],
    ['panorama_2.png', 'panorama_3.png'],
    ['panorama_3.png', 'panorama_0.png'],
    ['panorama_0.png', 'panorama_1.png'],
];

const MAX_BAND = 30; // en ust satirdaki kaynaşma genisligi (px)
const A_SHARE = 3 / 5; // soldaki gorselin band payi

function mix(a, b, t) {
    // t: 0..1 arasi a'dan b'ye agirlik
    return Math.round((a * (8 - t * 8) + b * t * 8) / 8);
}

function bandWidth(y, h) {
    // ucgen: ust satirda MAX_BAND, altta 0 (dogrusal)
    return Math.round((MAX_BAND * (h - 1 - y)) / (h - 1));
}

function load(name) {
    return PNG.sync.read(fs.readFileSync(path.join(DIR, name)));
}

function save(png, name) {
    fs.writeFileSync(path.join(DIR, name), PNG.sync.write(png, { colorType: 6 }));
}

function copyFile(src, dst) {
    fs.copyFileSync(src, dst);
}

function maxEdgeDelta(a, b, rows) {
    // dikiş hattindaki en buyuk renk farki; rows = [bas, son) satir araligi ya da null
    const w = a.width;
    const h = a.height;
    const yStart = rows ? rows[0] : 0;
    const yEnd = rows ? rows[1] : h;
    let maxD = 0;
    for (let y = yStart; y < yEnd; y++) {
        for (let c = 0; c < 3; c++) {
            const ai = a.data[(y * w + (w - 1)) * 4 + c];
            const bi = b.data[(y * w + 0) * 4 + c];
            const d = Math.abs(ai - bi);
            if (d > maxD) maxD = d;
        }
    }
    return maxD;
}

function blendSeam(left, right) {
    const w = left.width;
    const h = left.height;
    const ld = left.data;
    const rd = right.data;
    let blendedRows = 0;

    for (let y = 0; y < h; y++) {
        const band = bandWidth(y, h);
        if (band < 1) continue;
        const row = y * w * 4;

        // band 3/5 solda, 2/5 sagda; satir basina en az 1er kolon
        let aPx = Math.ceil(band * A_SHARE);
        let bPx = band - aPx;
        if (band === 1) {
            aPx = 1;
            bPx = 1;
        } else if (aPx < 1) {
            aPx = 1;
            bPx = band - 1;
        } else if (bPx < 1) {
            bPx = 1;
            aPx = band - 1;
        }

        // kenar renklerini oku (0 = dikişe en yakin kolon)
        const aSeam = [ld[row + (w - 1) * 4 + 0], ld[row + (w - 1) * 4 + 1], ld[row + (w - 1) * 4 + 2]];
        const bSeam = [rd[row + 0 * 4 + 0], rd[row + 0 * 4 + 1], rd[row + 0 * 4 + 2]];
        const aCols = [aSeam];
        const bCols = [bSeam];
        for (let d = 1; d < aPx; d++) {
            const c0 = row + (w - 1 - d) * 4;
            aCols.push([ld[c0], ld[c0 + 1], ld[c0 + 2]]);
        }
        for (let d = 1; d < bPx; d++) {
            const c0 = row + d * 4;
            bCols.push([rd[c0], rd[c0 + 1], rd[c0 + 2]]);
        }

        // dikiş kolonlari 50/50 esitlenir, sonra dikişten uzaklastikca erime azalir
        for (let d = 0; d < aPx; d++) {
            const t = 0.5 * (1 - d / aPx); // d=0 (dikiş) 0.5, band disinda ~0
            for (let c = 0; c < 3; c++) {
                ld[row + (w - 1 - d) * 4 + c] = mix(aCols[d][c], bSeam[c], t);
            }
        }
        for (let d = 0; d < bPx; d++) {
            const t = 0.5 * (1 - d / bPx);
            for (let c = 0; c < 3; c++) {
                rd[row + d * 4 + c] = mix(bCols[d][c], aSeam[c], t);
            }
        }

        blendedRows++;
    }
    return blendedRows;
}

// yedek al (ilk seferde)
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    for (const [l, r] of SEAMS) {
        for (const n of [l, r]) {
            const dst = path.join(BACKUP_DIR, n);
            if (!fs.existsSync(dst)) copyFile(path.join(DIR, n), dst);
        }
    }
    console.log('yedekler alindi:', BACKUP_DIR);
}

// once dikiş farkini raporla (ust yari)
const before = {};
for (const [l, r] of SEAMS) {
    before[l + '|' + r] = maxEdgeDelta(load(l), load(r), [0, 512]);
}

for (const [l, r] of SEAMS) {
    const lp = load(l);
    const rp = load(r);
    blendSeam(lp, rp);
    save(lp, l);
    save(rp, r);
}

// sonra dikiş farkini raporla
console.log('dikiş hatti max renk farki, ust yari (once -> sonra):');
for (const [l, r] of SEAMS) {
    const after = maxEdgeDelta(load(l), load(r), [0, 512]);
    console.log(`  ${l} <-> ${r}: ${before[l + '|' + r]} -> ${after} (0 = tam uyum)`);
}
console.log('tamamlandi');