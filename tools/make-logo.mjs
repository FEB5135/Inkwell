/**
 * Inkwell markası ve bütün ikon boyutları.
 *
 * Fikir: 永 karakterinin son stroğu henüz bitmemiş, fırça o stroğun ucunda
 * duruyor — "yazılmakta olan karakter".
 *
 * 永 (yǒng) seçildi çünkü 永字八法 olarak bilinen klasik alıştırma karakteri:
 * sekiz temel strok türünün hepsini içerdiği için hat yazısında yüzyıllardır
 * ilk yazılan karakter budur. Beş stroklu olması logoyu küçük boyutlarda da
 * okunur kılıyor — 墨 gibi 15 stroklu bir karakter 24 pikselde lekeye dönerdi.
 *
 * Strok yolları elle çizilmiyor, gerçek veriden (data/strokes.txt) geliyor.
 *
 * Üretilenler:
 *   icons/icon.svg          uygulama ikonu (kağıt zeminli, yuvarlak köşeli)
 *   icons/mark.svg          zeminsiz marka (başlıkta kullanılır)
 *   icons/icon-{192,512}.png, icon-180.png, icon-maskable.png
 *   android/.../mipmap-*    Android başlatıcı ikonları
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const CHAR = '永';
const INK = '#16130f';
const SEAL = '#c0392b';
const PAPER = '#faf7f2';

const RATIO = 0.78;     // son stroğun görünen kısmı
const ANGLE = 72;       // fırçanın eğimi

/* ── strok verisi ── */

const line = readFileSync('data/strokes.txt', 'utf8')
  .split('\n')
  .find((l) => l.startsWith(CHAR + '\t'));
if (!line) throw new Error(`${CHAR} için strok verisi yok`);

const [, strokeBlob, medianBlob] = line.split('\t');
const strokes = strokeBlob.split(';');
const medians = medianBlob
  .split(';')
  .map((m) => m.split(' ').filter(Boolean).map((p) => p.split(',').map(Number)));

/**
 * Son stroğu verilen oranda keser.
 *
 * Kesme, medyan boyunca çizilen kalın bir şeridin maske olarak kullanılmasıyla
 * yapılıyor: strok kendi kalınlığını korur, yalnız fırçanın henüz varmadığı
 * kısmı görünmez olur.
 */
function partialStroke(path, median, ratio, id) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < median.length; i++) {
    total += Math.hypot(median[i][0] - median[i - 1][0], median[i][1] - median[i - 1][1]);
    lengths.push(total);
  }
  const target = total * ratio;
  let idx = lengths.findIndex((l) => l >= target);
  if (idx < 0) idx = median.length - 2;

  const prev = median[idx];
  const next = median[idx + 1] ?? prev;
  const before = idx === 0 ? 0 : lengths[idx - 1];
  const t = (target - before) / Math.max(1, lengths[idx] - before);
  const tip = [prev[0] + (next[0] - prev[0]) * t, prev[1] + (next[1] - prev[1]) * t];

  const ribbon = median
    .slice(0, idx + 1)
    .concat([tip])
    .map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`)
    .join('');

  return {
    tip,
    mask: `<mask id="${id}"><path d="${ribbon}" fill="none" stroke="#fff" stroke-width="300" stroke-linecap="round" stroke-linejoin="round"/></mask>`,
    body: (fill) => `<path d="${path}" fill="${fill}" mask="url(#${id})"/>`,
  };
}

/** Fırça: sap, bilezik ve mürekkepli kıl demeti. */
function brush(outline) {
  const handle = 900;
  const w = 100;
  const tipLen = 270;

  return `<g transform="rotate(${-ANGLE})" ${outline ? `stroke="${outline}" stroke-width="34" stroke-linejoin="round" paint-order="stroke"` : ''}>
    <rect x="${tipLen * 0.5}" y="${-w / 2}" width="${handle}" height="${w}" rx="${w / 2}" fill="${INK}"/>
    <rect x="${tipLen * 0.5}" y="${-w / 2}" width="${w * 1.15}" height="${w}" rx="${w * 0.22}" fill="${SEAL}"/>
    <path d="M${tipLen * 0.58} ${-w * 0.82} Q${tipLen * 0.28} ${-w * 0.66} ${tipLen * 0.03} ${-w * 0.09} Q0 0 ${tipLen * 0.03} ${w * 0.09} Q${tipLen * 0.28} ${w * 0.66} ${tipLen * 0.58} ${w * 0.82} Z" fill="${INK}"/>
  </g>`.replace(/\s+/g, ' ');
}

/**
 * Markayı üretir.
 * @param size    tuval kenarı
 * @param pad     karakterin kenarlardan uzaklığı
 * @param shift   karaktere verilen yatay kaydırma (fırçaya yer açmak için)
 * @param outline fırçanın etrafındaki ayırıcı kenarın rengi (zeminsizse yok)
 */
function mark({ size = 512, pad, shift = 0, outline = PAPER, id = 'cut' }) {
  const cut = partialStroke(strokes.at(-1), medians.at(-1), RATIO, id);
  const k = (size - pad * 2) / 1024;
  const done = strokes.slice(0, -1).map((d) => `<path d="${d}" fill="${INK}"/>`).join('');

  const glyph = `<g transform="translate(${pad + shift}, ${size - pad}) scale(${k}, -${k})">${done}${cut.body(INK)}</g>`;
  const tip = [pad + shift + cut.tip[0] * k, size - pad - cut.tip[1] * k];

  return {
    defs: cut.mask,
    body: `${glyph}<g transform="translate(${tip[0]}, ${tip[1]}) scale(${k})">${brush(outline)}</g>`,
  };
}

/* ── dosyalar ── */

mkdirSync('icons', { recursive: true });

// Uygulama ikonu: kağıt zemin, yuvarlak köşe.
const icon = mark({ pad: 58, shift: -16, id: 'icon-cut' });
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Inkwell">
<defs>${icon.defs}</defs>
<rect width="512" height="512" rx="112" fill="${PAPER}"/>
${icon.body}
</svg>`;
writeFileSync('icons/icon.svg', iconSvg, 'utf8');

// Zeminsiz marka: arayüz başlığında, sayfanın kendi zemini üstünde durur.
const plain = mark({ pad: 24, shift: -14, outline: null, id: 'mark-cut' });
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Inkwell">
<defs>${plain.defs}</defs>
${plain.body}
</svg>`;
writeFileSync('icons/mark.svg', markSvg, 'utf8');

// Maskeli ikon: Android kenarları kırpar, içerik ortadaki güvenli alanda kalmalı.
const maskable = mark({ pad: 150, shift: -14, outline: SEAL, id: 'msk-cut' });
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>${maskable.defs}</defs>
<rect width="512" height="512" fill="${PAPER}"/>
${maskable.body}
</svg>`;

const png = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync('icons/icon-192.png', png(iconSvg, 192));
writeFileSync('icons/icon-512.png', png(iconSvg, 512));
writeFileSync('icons/icon-180.png', png(iconSvg, 180));
writeFileSync('icons/icon-maskable.png', png(maskableSvg, 512));

/* ── Android başlatıcı ikonları ── */

const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

// Uyarlanabilir ikonun ön katmanı: zemin ayrı, içerik güvenli alanda.
const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>${maskable.defs}</defs>
${maskable.body}
</svg>`;

let written = 0;
for (const [name, px] of Object.entries(DENSITIES)) {
  const dir = `${RES}/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/ic_launcher.png`, png(iconSvg, px));
  writeFileSync(`${dir}/ic_launcher_round.png`, png(iconSvg, px));
  writeFileSync(`${dir}/ic_launcher_foreground.png`, png(fgSvg, Math.round((px * 108) / 48)));
  written += 3;
}

// Uyarlanabilir ikonun zemini artık kağıt rengi (karakter siyah olduğu için).
writeFileSync(
  `${RES}/values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PAPER.toUpperCase()}</color>\n</resources>\n`,
  'utf8'
);

/* ── açılış görseli ── */

const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.34);
  const base = png(iconSvg, s);
  return { base, s };
};

for (const [name, [w, h]] of Object.entries({
  mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280],
  xxhdpi: [960, 1600], xxxhdpi: [1280, 1920],
})) {
  for (const [dir, size] of [
    [`${RES}/drawable-port-${name}`, [w, h]],
    [`${RES}/drawable-land-${name}`, [h, w]],
  ]) {
    mkdirSync(dir, { recursive: true });
    const [sw, sh] = size;
    const logoSize = Math.round(Math.min(sw, sh) * 0.3);
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw} ${sh}" width="${sw}" height="${sh}">
<rect width="${sw}" height="${sh}" fill="${PAPER}"/>
<g transform="translate(${(sw - logoSize) / 2}, ${(sh - logoSize) / 2}) scale(${logoSize / 512})">
<defs>${icon.defs}</defs>${icon.body}</g>
</svg>`;
    writeFileSync(`${dir}/splash.png`, png(sheet, sw));
    written++;
  }
}

mkdirSync(`${RES}/drawable`, { recursive: true });
writeFileSync(
  `${RES}/drawable/splash.png`,
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280" width="720" height="1280">
<rect width="720" height="1280" fill="${PAPER}"/>
<g transform="translate(252, 532) scale(0.42)"><defs>${icon.defs}</defs>${icon.body}</g></svg>`,
    720
  )
);

console.log(`marka yazıldı: icons/ (4 png + 2 svg), android res (${written} görsel)`);
