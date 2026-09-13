/**
 * CC-CEDICT -> Inkwell sözlük dosyası.
 *
 * Çıktı: data/cedict.tsv  (satır başına bir kayıt)
 *   simplified \t traditional \t pinyin(sayılı) \t anlam1;anlam2;anlam3
 *
 * traditional, basitleştirilmişle aynıysa boş bırakılır.
 *
 * Satırlar "yaygınlık" puanına göre büyükten küçüğe sıralanır; böylece
 * uygulamada ayrıca bir sıklık dosyası tutmaya gerek kalmaz, arama
 * sonuçları dosya sırası korunarak doğal biçimde yaygın olandan başlar.
 *
 * Yaygınlık ölçüsü CC-CEDICT'in kendisinden türetilir: bir karakter ne kadar
 * çok sözcükte geçiyorsa o kadar yaygındır. Bir sözcüğün puanı da onu oluşturan
 * en nadir karakterin puanıdır (bir sözcük ancak tüm karakterleri yaygınsa
 * yaygındır).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'tools/cedict.txt';
const OUT = 'data/cedict.tsv';

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;
const CJK = /[㐀-鿿豈-﫿]/;

// Kart kurmaya yaramayan, arama sonuçlarını kirleten tanımlar.
const NOISE = [
  /^variant of/i,
  /^old variant of/i,
  /^Japanese variant of/i,
  /^archaic variant of/i,
  /^erhua variant of/i,
  /^surname /,
  /^see [A-Z㐀-鿿]/i,
  /^abbr\. for/i,
  /^used in /i,
];

const raw = readFileSync(SRC, 'utf8').split('\n');
const entries = [];

for (const line of raw) {
  if (!line || line.startsWith('#')) continue;
  const m = LINE.exec(line);
  if (!m) continue;

  const [, trad, simp, pinyin, defBlob] = m;
  if (!CJK.test(simp)) continue; // "119", "AA制" gibi kayıtlar

  let defs = defBlob
    .split('/')
    .map((d) => d.trim())
    .filter(Boolean)
    // "CL:個|个[ge4]" ölçü sözcüğü notları kart için gürültü.
    .filter((d) => !d.startsWith('CL:'))
    // Tanım içindeki "漢字|汉字[han4 zi4]" göndermelerini sadeleştir.
    .map((d) => d.replace(/[㐀-鿿]+\|([㐀-鿿]+)\[[^\]]*\]/g, '$1'));

  if (!defs.length) continue;

  defs = defs.slice(0, 3);
  let meaning = defs.join(';');
  if (meaning.length > 150) meaning = meaning.slice(0, 147) + '...';

  entries.push({
    simp,
    trad: trad === simp ? '' : trad,
    pinyin,
    meaning,
    noise: NOISE.some((re) => re.test(defs[0])),
  });
}

// 1. geçiş: karakter başına "kaç sözcükte geçiyor" sayımı.
const charCount = new Map();
for (const e of entries) {
  for (const ch of new Set(e.simp)) {
    charCount.set(ch, (charCount.get(ch) ?? 0) + 1);
  }
}

// 2. geçiş: puanlama.
for (const e of entries) {
  let min = Infinity;
  for (const ch of e.simp) min = Math.min(min, charCount.get(ch) ?? 0);
  let score = min;
  if (e.noise) score *= 0.15;
  if (e.simp.length === 1) score *= 1.4; // tek karakterler ders kitabında daha sık hedeftir
  if (e.simp.length > 4) score *= 0.5;
  e.score = score;
}

entries.sort((a, b) => b.score - a.score);

const out = entries.map((e) => `${e.simp}\t${e.trad}\t${e.pinyin}\t${e.meaning}`).join('\n');
writeFileSync(OUT, out, 'utf8');

console.log(`${entries.length} kayıt -> ${OUT} (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
console.log('\nEn yaygın 15 kayıt (sıralama denetimi):');
for (const e of entries.slice(0, 15)) console.log(`  ${e.simp}\t${e.pinyin}\t${e.meaning.slice(0, 40)}`);
