/**
 * Yazılan cevabın değerlendirilmesi.
 *
 * Amaç "doğru/yanlış" ikiliğinden kurtulmak. Bir hecenin tonunu kaçırmakla
 * karakteri tamamen bilmemek aynı şey değil; ilkinde kartı sıfırlamak
 * gereksiz ceza olur, ikincisinde geçer not vermek öğrenmeyi bozar. Bu yüzden
 * cevap bir yakınlık derecesine oturtulur ve önerilen not ona göre seçilir.
 */
import { segment, toNumbers } from './pinyin.js';

/* ═══════════ pinyin ═══════════ */

/** İki dizgi arasındaki düzenleme uzaklığı (Levenshtein). */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

const flatten = (segs) => (segs ?? []).map((x) => x.base).join('');

/**
 * Yazılan okunuşu beklenenle karşılaştırır.
 *
 * Dönen `level`:
 *   exact  — heceler ve tonlar tam
 *   tone   — heceler doğru, en az bir ton yanlış
 *   near   — bir harflik sapma (yazım hatası sayılır)
 *   wrong  — başka bir şey
 *
 * `syllables` alanı arayüzde hangi hecenin ıskalandığını göstermek için
 * hece hece durum taşır.
 */
export function comparePinyin(given, expected) {
  const g = segment(given);
  const e = segment(expected);

  if (!g || !e) {
    // Hecelere ayrılamadıysa düz karşılaştırmaya düş.
    const a = toNumbers(given).replace(/[^a-z1-5]/g, '');
    const b = toNumbers(expected).replace(/[^a-z1-5]/g, '');
    return {
      level: a === b ? 'exact' : editDistance(a, b) <= 1 ? 'near' : 'wrong',
      syllables: null,
    };
  }

  if (g.length === e.length && g.every((x, i) => x.base === e[i].base)) {
    const syllables = e.map((x, i) => ({
      base: x.base,
      tone: x.tone,
      given: g[i].tone,
      ok: g[i].tone === x.tone,
    }));
    const allTones = syllables.every((x) => x.ok);
    return { level: allTones ? 'exact' : 'tone', syllables };
  }

  const dist = editDistance(flatten(g), flatten(e));
  const len = flatten(e).length;
  return {
    level: dist <= 1 && len >= 3 ? 'near' : 'wrong',
    syllables: null,
  };
}

/* ═══════════ anlam ═══════════ */

const STOP = new Set([
  'to', 'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'be', 'is',
  'bir', 've', 'ile',
]);

/** Karşılaştırma için sadeleştirir: küçük harf, aksansız, noktalamasız. */
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const contentWords = (text) =>
  normalize(text).split(' ').filter((w) => w && !STOP.has(w));

/**
 * CC-CEDICT karşılıkları açıklama parantezleri taşır:
 * "name (of a person or thing)", "cat (CL:只)", "(coll.) modem". Parantez
 * içi karşılığın kendisi değil, onu ayırt eden nottur — cevabın parçası
 * sayılırsa "name" yazan kullanıcı eksik cevap vermiş gibi görünür.
 * Parantezi atınca geriye bir şey kalmıyorsa (karşılığın tamamı parantezse)
 * özgün metne dönülür.
 */
function coreSense(sense) {
  const core = String(sense).replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  return contentWords(core).length ? core : sense;
}

/**
 * Yazılan anlamı kayıttaki anlamla karşılaştırır.
 *
 * Anlam alanı birden çok karşılık taşır ("teacher; instructor" ya da kendi
 * yazdığın "öğretmen, hoca"). Bunlardan **herhangi biri** tutuyorsa cevap
 * doğrudur: kart "bu sözcüğü biliyor musun" diye sorar, sözlüğün tam
 * ifadesini ezberlemeni değil.
 *
 * Serbest metin olduğu için burada kesinlik iddiası yok; bu yüzden arayüz
 * her zaman "aslında doğruydu" seçeneği sunar.
 */
export function compareMeaning(given, expected) {
  const g = normalize(given);
  if (!g) return { level: 'wrong' };

  const senses = String(expected ?? '')
    .split(/[;,/]|\s+·\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const gWords = contentWords(given);

  for (const sense of senses) {
    const s = normalize(sense);
    if (!s) continue;
    if (s === g || normalize(coreSense(sense)) === g) return { level: 'exact', matched: sense };

    const sWords = contentWords(coreSense(sense));
    if (!sWords.length) continue;

    // Anlamlı sözcüklerin tamamı yazıldıysa doğru say ("teacher" ↔ "a teacher")
    const allPresent = sWords.every((w) => gWords.includes(w));
    const anyPresent = sWords.some((w) => gWords.includes(w));
    if (allPresent) return { level: 'exact', matched: sense };

    // Tek sözcüklük karşılıkta bir harflik yazım hatasını hoş gör.
    if (sWords.length === 1 && gWords.length === 1) {
      if (editDistance(gWords[0], sWords[0]) <= 1) return { level: 'near', matched: sense };
    }
    if (anyPresent) return { level: 'near', matched: sense };
  }

  return { level: 'wrong' };
}

/* ═══════════ not önerisi ═══════════ */

import { AGAIN, HARD, GOOD } from './srs.js';

/**
 * Yakınlık derecesinden önerilen not.
 *
 * "Kolay" hiçbir zaman önerilmez: bir cevabın zahmetsiz olduğuna ancak
 * kullanıcı karar verebilir, doğruluğu tek başına bunu göstermez.
 */
export function suggestGrade(level) {
  if (level === 'exact') return GOOD;
  if (level === 'tone' || level === 'near') return HARD;
  return AGAIN;
}

export const VERDICT_TEXT = {
  exact: 'Doğru',
  tone: 'Ton yanlış',
  near: 'Neredeyse',
  wrong: 'Yanlış',
};
