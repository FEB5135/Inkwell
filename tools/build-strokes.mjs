/**
 * hanzi-writer-data -> data/strokes.txt
 *
 * Kalemle yazma pratiği için her karakterin strok yolları ve medyanları
 * gerekiyor. Kaynak paket karakter başına bir JSON dosyası tutuyor (toplam
 * 50 MB); uygulamanın bunları tek tek indirmesi ya da hepsini birden
 * ayrıştırması anlamsız.
 *
 * Çıktı, satır başına bir karakter olan düz bir metin dosyası:
 *
 *   好\tSTROK1;STROK2;…\tMEDYAN1;MEDYAN2;…
 *
 * Uygulama dosyayı bir kez okuyup karakter → satır dizini kurar, ayrıştırmayı
 * ise yalnız o an çalışılan karakter için yapar.
 *
 * Küçültme:
 *   - radStrokes (kök strok numaraları) atılıyor, sınama için gereksiz.
 *   - Sayılar tam sayıya yuvarlanıyor; tuval zaten 1024 birimlik.
 *   - SVG komut harflerinden sonraki boşluklar kaldırılıyor.
 *   - Medyan noktaları, 8 birimden yakın komşularını eleyerek seyreltiliyor;
 *     eşleştirme toleransı bunun çok üstünde olduğu için doğruluk düşmüyor.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'node_modules/hanzi-writer-data';
const OUT = 'data/strokes.txt';
const MEDIAN_MIN_GAP = 8;

const files = readdirSync(SRC).filter((f) => f.endsWith('.json') && f !== 'package.json');

/** "M 330 202 Q 361 175" -> "M330 202Q361 175" */
function packPath(d) {
  return d
    .replace(/(\d)\s+(\d)/g, '$1 $2')
    .replace(/([A-Za-z])\s+/g, '$1')
    .replace(/\s+([A-Za-z])/g, '$1')
    .replace(/\.\d+/g, (m) => (Math.abs(Number(m)) >= 0.5 ? '' : '')) // ondalık yok say
    .trim();
}

/** Ardışık ve birbirine çok yakın medyan noktalarını atar. */
function thinMedian(points) {
  const out = [];
  for (const [x, y] of points) {
    const p = [Math.round(x), Math.round(y)];
    if (!out.length) { out.push(p); continue; }
    const [px, py] = out[out.length - 1];
    if (Math.abs(p[0] - px) + Math.abs(p[1] - py) >= MEDIAN_MIN_GAP) out.push(p);
  }
  // Son nokta strok sonunu belirler, her hâlükârda korunur.
  const last = points[points.length - 1];
  const lastRounded = [Math.round(last[0]), Math.round(last[1])];
  const tail = out[out.length - 1];
  if (!tail || tail[0] !== lastRounded[0] || tail[1] !== lastRounded[1]) out.push(lastRounded);
  return out;
}

const lines = [];
let skipped = 0;

for (const file of files) {
  const char = file.replace(/\.json$/, '');
  if ([...char].length !== 1) continue;

  let data;
  try {
    data = JSON.parse(readFileSync(join(SRC, file), 'utf8'));
  } catch {
    skipped++;
    continue;
  }
  if (!data.strokes?.length || !data.medians?.length) { skipped++; continue; }

  const strokes = data.strokes.map(packPath).join(';');
  const medians = data.medians
    .map((m) => thinMedian(m).map((p) => p.join(',')).join(' '))
    .join(';');

  lines.push(`${char}\t${strokes}\t${medians}`);
}

const out = lines.join('\n');
writeFileSync(OUT, out, 'utf8');

console.log(
  `${lines.length} karakter -> ${OUT} (${(Buffer.byteLength(out) / 1024 / 1024).toFixed(1)} MB)` +
    (skipped ? `, ${skipped} atlandı` : '')
);
