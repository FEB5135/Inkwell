/**
 * CC-CEDICT -> Inkwell sözlük dosyası.
 *
 * Çıktı: data/cedict.tsv  (satır başına bir kayıt)
 *   simplified \t traditional \t pinyin(sayılı) \t anlam1;anlam2;anlam3
 *
 * traditional, basitleştirilmişle aynıysa boş bırakılır.
 *
 * Satırlar "öğrenciye yararlılık" puanına göre büyükten küçüğe sıralanır;
 * böylece uygulamada ayrı bir sıklık dosyası tutmaya gerek kalmaz, arama
 * sonuçları dosya sırası korunarak doğal biçimde en olası adaydan başlar.
 *
 * Puanlama iki kaynağa dayanır:
 *
 *   1. Jun Da'nın modern Çince karakter sıklığı (gerçek derlem sayımı).
 *      Bir sözcüğün tabanı, onu oluşturan *en nadir* karakterin sıklığıdır:
 *      bir sözcük ancak bütün karakterleri yaygınsa yaygındır.
 *
 *   2. HSK 3.0 kelime listesi. HSK'da geçen her sözcük, geçmeyen her şeyin
 *      önüne alınır ve kendi içinde seviyesine göre sıralanır. Ders kitabıyla
 *      çalışan biri için doğru aday neredeyse her zaman HSK'dadır.
 *
 * Sıklık verisi olmadan (yalnız CC-CEDICT'ten türetilen bir ölçüyle) "ni3"
 * sorgusu 你 yerine 拟 getiriyordu: 拟 daha çok bileşik sözcükte geçiyor ama
 * gerçek metinde çok daha nadir.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'tools/cedict.txt';
const FREQ = 'tools/hanzi-freq.csv';
const HSK = 'tools/hsk30.csv';
const OUT = 'data/cedict.tsv';

const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;
const CJK = /[㐀-鿿豈-﫿]/;

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

/* ── karakter sıklığı ── */

const charRank = new Map();
for (const line of readFileSync(FREQ, 'utf8').split('\n').slice(1)) {
  const parts = line.split(',');
  if (parts.length < 2) continue;
  const rank = Number(parts[0]);
  if (Number.isFinite(rank) && parts[1]) charRank.set(parts[1], rank);
}

const MAX_RANK = 10000;
/** Sık karakter yüksek puan alır; listede olmayan nadir karakter sıfır. */
const charScore = (ch) => {
  const rank = charRank.get(ch);
  return rank ? MAX_RANK - rank : 0;
};

/* ── HSK seviyeleri ── */

const hskLevel = new Map();
{
  const rows = readFileSync(HSK, 'utf8').split('\n');
  const head = rows[0].split(',');
  const iSimp = head.indexOf('Simplified');
  const iLevel = head.indexOf('Level');
  for (const line of rows.slice(1)) {
    const parts = line.split(',');
    if (parts.length <= Math.max(iSimp, iLevel)) continue;
    const word = parts[iSimp];
    // Seviyeler "1".."6" ve ileri düzey için "7-9".
    const level = parts[iLevel] === '7-9' ? 7 : Number(parts[iLevel]);
    if (!word || !Number.isFinite(level)) continue;
    const prev = hskLevel.get(word);
    if (prev === undefined || level < prev) hskLevel.set(word, level);
  }
}

/* ── sözlük ── */

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

/* ── puanlama ── */

// HSK katkısı, taban puanın erişebileceği en yüksek değerden büyük seçildi:
// böylece ilk altı seviyedeki her sözcük, listede olmayan her şeyin önüne geçer.
//
// "7-9" kümesi yükseltme almaz: 5636 sözcüklük ileri düzey bir torba olduğu
// için yükseltilirse yaygın karakterleri geri iter — 抹 (HSK 7-9, sıklık 2087)
// 妈'yı (listede yok, sıklık 750) geçiyordu. O seviyede sıralamayı sıklık
// belirlesin.
const HSK_STEP = 20000;
const HSK_BOOSTED_MAX = 6;

for (const e of entries) {
  let base = Infinity;
  for (const ch of e.simp) base = Math.min(base, charScore(ch));
  if (!Number.isFinite(base)) base = 0;

  if (e.noise) base *= 0.15;
  if (e.simp.length > 4) base *= 0.6;

  const level = hskLevel.get(e.simp);
  const boosted = level && level <= HSK_BOOSTED_MAX;
  e.score = base + (boosted ? (HSK_BOOSTED_MAX + 1 - level) * HSK_STEP : 0);
}

entries.sort((a, b) => b.score - a.score);

const out = entries.map((e) => `${e.simp}\t${e.trad}\t${e.pinyin}\t${e.meaning}`).join('\n');
writeFileSync(OUT, out, 'utf8');

console.log(
  `${entries.length} kayıt -> ${OUT} (${(out.length / 1024 / 1024).toFixed(1)} MB)\n` +
    `${charRank.size} karakter sıklığı, ${hskLevel.size} HSK sözcüğü kullanıldı.`
);

// Sıralamanın doğru çalıştığını görmek için birkaç denetim sorgusu.
const firstFor = (pinyin) =>
  entries.find((e) => e.pinyin.toLowerCase().replace(/\s+/g, '') === pinyin);

console.log('\nOkunuştan ilk aday (denetim):');
for (const p of ['ni3', 'hao3', 'shui3', 'ma1', 'shi4', 'wo3', 'ta1', 'shu1',
                 'xue2', 'mao1', 'gou3', 'lao3shi1', 'dian4hua4', 'xie4xie5']) {
  const hit = firstFor(p);
  console.log(`  ${p.padEnd(10)} -> ${hit ? `${hit.simp}  ${hit.meaning.slice(0, 40)}` : '—'}`);
}
