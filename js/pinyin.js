/**
 * Pinyin yardımcıları.
 *
 * Temel varsayım: kullanıcıda İngilizce klavye var. Yani hiçbir yerde ton
 * işaretini doğrudan yazması beklenmez — "hao3" yazar, biz "hǎo" gösteririz.
 * Cevap denetiminde de her iki yazım kabul edilir.
 */

import { SYLLABLES } from './syllables.js';

const MARKS = {
  a: 'aāáǎà', e: 'eēéěè', i: 'iīíǐì',
  o: 'oōóǒò', u: 'uūúǔù', ü: 'üǖǘǚǜ',
};

// Ton işaretli harften çıplak harf + ton numarasına.
const FROM_MARK = new Map();
for (const [base, forms] of Object.entries(MARKS)) {
  [...forms].forEach((ch, tone) => FROM_MARK.set(ch, [base, tone]));
}

/** Bir hecede ton işaretinin hangi sesliye konacağını bulur. */
function toneSeat(syl) {
  const i = syl.indexOf('a');
  if (i >= 0) return i;
  const o = syl.indexOf('o');
  if (o >= 0) return o;
  const e = syl.indexOf('e');
  if (e >= 0) return e;
  // Kalan durumlar (iu, ui, i, u, ü): işaret son sesliye gider.
  for (let k = syl.length - 1; k >= 0; k--) {
    if ('iuü'.includes(syl[k])) return k;
  }
  return -1;
}

/** "nv3" / "nu:3" gibi ü yazımlarını tek biçime indirger. */
function unifyU(s) {
  return s.replace(/u:/g, 'ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
}

/**
 * "ni3 hao3" -> "nǐ hǎo".  Sayısız metni olduğu gibi bırakır, yani zaten
 * işaretli girdiler de güvenle bu fonksiyondan geçirilebilir.
 */
export function toMarks(input) {
  if (!input) return '';
  return unifyU(String(input)).replace(/([a-zA-ZüÜ]+)([1-5])/g, (all, letters, tone) => {
    const t = Number(tone);
    if (t === 5) return letters; // hafif ton: işaret yok
    const lower = letters.toLowerCase();
    const seat = toneSeat(lower);
    if (seat < 0) return letters;
    const base = lower[seat];
    const marked = MARKS[base]?.[t];
    if (!marked) return letters;
    const out = letters.slice(0, seat) + marked + letters.slice(seat + 1);
    // Baş harf büyükse koru (Bei3jing1 -> Běijīng)
    return letters[0] === letters[0].toUpperCase() && /[a-zA-Z]/.test(letters[0])
      ? out[0].toUpperCase() + out.slice(1)
      : out;
  });
}

/**
 * Metni harf dizisine ve her harfe düşen tona ayırır.
 *
 * Hem "lao3" hem "lǎo" aynı sonucu verir: harfler "lao", ton 3. Sayılar
 * kendinden önceki harfe bağlanır, işaretler bulundukları harfe.
 */
function decompose(input) {
  const letters = [];
  const tones = [];
  for (const raw of unifyU(String(input))) {
    const ch = raw.toLowerCase();
    if (ch >= '1' && ch <= '5') {
      if (letters.length) tones[letters.length - 1] = Number(ch);
      continue;
    }
    const marked = FROM_MARK.get(ch);
    if (marked) {
      // Hece dağarcığı ü yerine v yazar; işaretli harfte de aynı biçim.
      letters.push(marked[0] === 'ü' ? 'v' : marked[0]);
      tones.push(marked[1]);
      continue;
    }
    if (/[a-zü]/.test(ch)) {
      letters.push(ch === 'ü' ? 'v' : ch);
      tones.push(0);
      continue;
    }
    letters.push(null); // hece sınırı (boşluk, tire, noktalama)
    tones.push(0);
  }
  return { letters, tones };
}

/**
 * Bir harf dizisini hecelere böler.
 *
 * Hece sınırları her zaman belirgin değil ("xian" tek hece mi, xi+an mı), o
 * yüzden geri izlemeli arama yapılıp en az parçalı bölünme seçilir — Çince'de
 * doğru olan odur.
 *
 * Ton, hecenin kapsadığı harflerden hangisinde bulunduysa ondan alınır;
 * böylece "lǎoshī" ile "lao3shi1" aynı sonuca çıkar.
 */
export function segment(input) {
  const { letters, tones } = decompose(input);
  const out = [];
  let run = [];
  let runTones = [];

  const flush = () => {
    if (!run.length) return true;
    const parts = splitRun(run.join(''), runTones);
    run = [];
    runTones = [];
    if (!parts) return false;
    out.push(...parts);
    return true;
  };

  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === null) {
      if (!flush()) return null;
      continue;
    }
    run.push(letters[i]);
    runTones.push(tones[i]);
  }
  return flush() ? out : null;
}

function splitRun(text, tones) {
  const memo = new Map();

  const walk = (i) => {
    if (i >= text.length) return [];
    if (memo.has(i)) return memo.get(i);

    let best = null;
    for (let len = Math.min(6, text.length - i); len >= 1; len--) {
      const base = text.slice(i, i + len);
      if (!SYLLABLES.has(base)) continue;
      const rest = walk(i + len);
      if (rest === null) continue;

      let tone = 0;
      for (let k = i; k < i + len; k++) if (tones[k]) tone = tones[k];

      const candidate = [{ base, tone: tone === 5 ? 0 : tone }, ...rest];
      if (!best || candidate.length < best.length) best = candidate;
    }
    memo.set(i, best);
    return best;
  };

  return walk(0);
}

/**
 * Ton işaretli metni "ni3hao3" biçimine çevirir.
 *
 * Hecelere ayrılabiliyorsa ton numarası hecenin sonuna konur; ayrılamıyorsa
 * (yazım hatası, pinyin olmayan metin) harfler olduğu gibi bırakılır ve ton
 * bulunduğu yere yazılır.
 */
export function toNumbers(input) {
  if (!input) return '';
  const segs = segment(input);
  if (segs) return segs.map((s) => s.base + (s.tone || '')).join('');

  const { letters, tones } = decompose(input);
  let out = '';
  for (let i = 0; i < letters.length; i++) {
    out += letters[i] ?? ' ';
    if (tones[i]) out += tones[i];
  }
  return out.trim();
}

/** Aramada kullanılan biçim: ton yok, boşluk yok, küçük harf. */
export function toneless(input) {
  return toNumbers(input).replace(/[1-5]/g, '').replace(/[^a-zü]/g, '');
}

/**
 * Cevap denetimi için kanonik biçim: boşluksuz, küçük harf, tonlar sayıya
 * çevrilmiş. Hafif ton (5) yazılmamış sayılır ki "de" ile "de5" eşit olsun.
 */
export function canonical(input) {
  return toNumbers(input)
    .toLowerCase()
    .replace(/[^a-zü1-5]/g, '')
    .replace(/5/g, '');
}

/** Kullanıcının yazdığı cevap doğru mu? */
export function answerMatches(given, expected) {
  const g = canonical(given);
  if (!g) return false;
  return g === canonical(expected);
}

/** Ton yok sayılırsa doğru muydu? "Sadece tonu kaçırdın" demek için. */
export function matchesButTone(given, expected) {
  return toneless(given) === toneless(expected) && toneless(given) !== '';
}

/** Tek bir hecenin pinyin gibi görünüp görünmediği — toplu yapıştırma ayrıştırıcısı için. */
const SYLLABLE = /^(?:[bpmfdtnlgkhjqxrzcsyw]|zh|ch|sh)?(?:i|u|ü|v|a|o|e)[a-zü:]*[1-5]?$/i;
export function looksLikePinyin(token) {
  const t = unifyU(token.toLowerCase()).replace(/[.,;:!?]/g, '');
  if (!t) return false;
  // "er", "n", "ng" gibi istisnalar
  if (/^(er|r|n|ng|hm|hng|m)[1-5]?$/.test(t)) return true;
  return SYLLABLE.test(t);
}
